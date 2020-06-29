
require("dotenv").config();

const axios = require("axios");
const EventEmitter3 = require("eventemitter3");

const { getToken } = require("./token");
const { Client } = require("tmi.js");

const MessageQueue = require("./MessageQueue");
const { difference } = require("lodash");

class App extends EventEmitter3 {
  constructor(options = {
    startWhenReady: true,
    tickInterval: 1000 * 60
  }) {
    super();

    this.opts = options;

    /** axios instance */
    this.api = null;

    /** metadata from twtich */
    this.metadata = [];

    /** raw token data */
    this.tokenData = {};

    /** cached game id for Marbles */
    this.gameId = null;

    /** processed env variables for channels to stay joiend to */
    this.channelsToJoin = null;
    if(process.env.TWITCH_CHANNELS) {
      this.channelsToJoin = process.env.TWITCH_CHANNELS.split(",").map(c => "#" + c);
    }
    this.chat = null;

    /** @type string[] */
    this.streamers = [];

    /** @type Map<string, MessageQueue> */
    this.messageQueue = new Map();
  }
  
  _addListeners() {
    this.once("ready", () => {
      if(this.opts.startWhenReady) {
        console.log("Ready, starting");
        this.start();
      }
    });

    this.chat.on("message", (channel, tags, message, self) => {
      if(self) return;

      const queue = this.messageQueue.get(channel);
      queue.parse(message);
    });
  }

  async create() {
    this.chat = new Client({
      options: { debug: false },
      connection: {
        reconnect: true,
        secure: true
      },
      identity: {
        username: process.env.TWITCH_USERNAME,
        password: process.env.TWITCH_OAUTH
      },
      channels: this.channelsToJoin
    });    
    this.chat.setMaxListeners(50);
    await this.chat.connect();

    await this.getTokenData();
    this.api = axios.create({
      baseURL: "https://api.twitch.tv/helix",
      headers: {
        "Client-ID": process.env.TWITCH_CLIENTID,
        "Authorization": `Bearer ${this.token}`
      }
    });
    
    await this.getGamesMetadata();

    this._addListeners();

    this.emit("ready");
  }

  async getGamesMetadata() {
    try {
      const { data } = await this.api(`/games?name=Marbles On Stream`);
      const games = data.data;
      if(games.length) {
        this.gameId = games[0].id;
        console.log("Got game metadata.")
      } else {
        throw Error("Not enough results found.");
      }
    } catch(err) {
      console.error("Couldn't get games metadata", err);
    }
  }

  async tick() {
    console.log("Performing tick.");

    try {
      await this.getCurrentStreamers();
      this.joinStreamChats();
    } catch(err) {
      console.error("Tick failed", err);
    }
  }

  async getCurrentStreamers() {
    try {
      const { data } = await this.api(`/streams?game_id=${this.gameId}`);
      const streamers = data.data.slice(0, 10);

      if(streamers.length) {
        this.streamers = streamers.map(streamer => "#" + streamer.user_name.toLowerCase());
        console.log(`Got ${streamers.length} streamers.`);
      } else {
        throw Error("No streamers found.");
      }
    } catch (err) {
      console.error("Couldn't get current streamers", err);
    }
  }

  joinStreamChats() {
    console.log(`Parting fresh channels (${this.chat.channels.length})`);
    
    const newlyOffline = difference(this.chat.channels, this.streamers);
    newlyOffline.forEach(streamer => {
      if(this.channelsToJoin.some(channel => streamer !== channel)) {
        this.chat.part(streamer);
        console.log(`Parting ${streamer}`)
      } else {
        console.log(`Not parting ${streamer}, predefined.`)
      }
    });

    // Joining channels
    this.streamers.forEach(streamer => {
      this.chat.join(streamer);

      // create a queue
      if(!this.messageQueue.has(streamer)) {
        const queue = new MessageQueue({
          channel: streamer
        });
        queue.on("trigger", data => {
          const { channel, message } = data;
          console.log(`Attempting to play in ${channel}`);
          this.chat.say(channel, message);
        });
        this.messageQueue.set(streamer, queue);
      }

      console.log(`Joined ${streamer} chat`);
    });
    
    console.log("Joined new streamers");
  }

  start() {
    this.tick();
    setInterval(() => {
      this.tick();
    }, this.opts.tickInterval);
    console.log(`Starting with ${this.opts.tickInterval}ms in between ticks.`);
  }

  async getTokenData() {
    try {
      this.tokenData = await getToken();
      console.info(`Got token ${this.token}`);
      this.emit("token:refresh");
    } catch(err) {
      console.error(`Failed to get token`, err);
    }
  }

  get token() {
    return this.tokenData.access_token;
  }
}

module.exports = App;


require("dotenv").config();

const axios = require("axios");
const EventEmitter3 = require("eventemitter3");

const { getToken } = require("./token");
const { Client } = require("tmi.js");

const MessageQueue = require("./MessageQueue");
const { difference } = require("lodash");

const { join } = require("path");
const { readFileSync } = require("fs");

class App extends EventEmitter3 {
  /**
   * 
   * @param {object} options 
   * @param {boolean} options.startWhenReady Start immediately when ready. Default: true
   * @param {number} options.tickInterval Time in ms between getting stream data ticks. Default: 60000
   * @param {function} options.streamFilter Function to filter streams based on API data
   * @param {boolean} options.useCachedGameData Whether to use cached game data from "./gameData.json"
   * @param {boolean} options.onlyJoinOneChat Whether to join only one chat at a time.
   * @param {string[]} options.channels Channels to join, not prefixed with "#"
   * @param {object} options.messageQueueOptions Options for MessageQueue
   */
  constructor(options = {}) {
    super();

    const defaults = {
      startWhenReady: true,
      tickInterval: 1000 * 60,
      streamFilter: () => true,
      useCachedGameData: true,
      onlyJoinOneChat: true,
      channels: [],
      messageQueueOptions: {
        flushDelay: 1000 * 30
      }
    };
    options = Object.assign(defaults, options);
    this.opts = options;

    if(this.opts.channels.length) {
      console.log(`channels defined, only joining: ${this.opts.channels.join(", ")}`);
    }

    if(this.opts.onlyJoinOneChat) {
      console.info(`only joining one chat at a time`);
    }

    /** axios instance */
    this.api = null;

    /** metadata from twtich */
    this.metadata = [];

    /** raw token data */
    this.tokenData = {};

    /** cached game id for Marbles */
    this.gameId = null;
    if(this.useCachedGameData) {
      const cachedGameData = readFileSync(join("gameData.json"), "utf8");
      if(cachedGameData) {
        const parsed = JSON.parse(cachedGameData);
        this.gameId = parsed.game_id;
      }
    }

    this.streamFilterFunc = options.streamFilter;

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
      if(!this.messageQueue.has(channel)) return;

      const queue = this.messageQueue.get(channel);
      queue.parse(message);
    });
  }

  async create() {
    this.chat = new Client({
      options: { debug: this.opts.debug || false },
      connection: {
        reconnect: true,
        secure: true
      },
      identity: {
        username: process.env.TWITCH_USERNAME,
        password: process.env.TWITCH_OAUTH
      },
      channels: this.opts.channels
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
    
    if(!this.gameId) {
      await this.getGamesMetadata();
    } else {
      console.log("Using cached game data.");
    }

    this.firstRun = true;

    this._addListeners();

    this.emit("ready");
  }

  async getGamesMetadata() {
    try {
      const { data } = await this.api(`/games?name=Marbles On Stream`);
      const games = data.data;
      if(games.length) {
        this.gameId = games[0].id;
        console.log("[app] got game metadata.")
      } else {
        throw Error("[app] Not enough game results found.");
      }
    } catch(err) {
      console.error("[app] Couldn't get games metadata", err);
    }
  }

  async tick() {
    console.log("[tick] performing");

    try {
      await this.getCurrentStreamers();
      this.joinStreamChats();
      this.firstRun = false;
    } catch(err) {
      console.error("[tick] failed", err);
    }
  }

  async getCurrentStreamers() {
    // If opts.channels is defined, only use those streamers
    if(this.opts.channels && this.opts.channels.length) {
      return this.opts.channels.map(c => "#" + c);
    }

    try {
      const { data } = await this.api(`/streams?game_id=${this.gameId}`);
      const streamers = data.data;

      if(streamers.length) {
        this.streamers = streamers
          .filter(this.streamFilterFunc)
          .map(streamer => "#" + streamer.user_name.toLowerCase());
        console.log(`Got ${this.streamers.length} streamers. ${streamers.length} total.`);
      } else {
        throw Error("No streamers found.");
      }
    } catch (err) {
      console.error("Couldn't get current streamers", err);
    }
  }

  joinStreamChats() {
    const createChannelQueue = (streamer) => {
      if(!this.messageQueue.has(streamer)) {
        const queueOptions = Object.assign(this.opts.messageQueueOptions, {
          channel: streamer
        });

        const queue = new MessageQueue(queueOptions);
        queue.on("trigger", data => {
          const { channel, message } = data;
          console.log(`[${channel}] attempting to play`);
          this.chat.say(channel, message);
        });
        this.messageQueue.set(streamer, queue);
        console.info(`[queue] created for ${streamer}`);
      } else {
        console.info(`[queue] got cached for ${streamer}`);
      }

      return this.messageQueue.get(streamer);
    }

    if(this.opts.channels && this.opts.channels.length) {
      this.opts.channels.map(channel => createChannelQueue(channel));
      return;
    }

    if(!this.firstRun){
      console.log(`Parting now-offline channels (${this.chat.channels.length})`);
      const newlyOffline = difference(this.chat.channels, this.streamers);
      newlyOffline.forEach(streamer => {
        if(this.channelsToJoin.some(channel => streamer !== channel)) {
          this.chat.part(streamer).catch(err => console.error("Couldn't part", err));
          console.log(`[part] ${streamer}`)
        } else {
          console.log(`[not part] ${streamer}, predefined.`)
        }
      });
    } else {
      console.log("First run, not parting streams.");
    }

    /**
     * Limit to first if `onlyJoinOneChat` is set.
     */
    if(this.opts.onlyJoinOneChat) {
      this.streamers = this.streamers.slice(0, 1);
    }

    // Joining channels
    this.streamers.forEach(streamer => {
      this.chat.join(streamer).catch(err => console.error("Error joining channel", err));

      // create a queue
      createChannelQueue(streamer);

      console.log(`[${streamer}] joined chat`);
    });
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

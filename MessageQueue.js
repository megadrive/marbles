
const EventEmitter3 = require("eventemitter3");

module.exports = class MessageQueue extends EventEmitter3 {
  constructor(options = {
    channel: "",
    timeToLive: 0,
    numberOfTriggerMessages: 0,
    triggerMessage: "",
    cooldown: 0,
    verbose: false
  }) {
    super();

    const defaults = {
      timeToLive: 10 * 1000,
      numberOfTriggerMessages: 3,
      triggerMessage: "!play",
      cooldown: 2 * 60 * 1000, // 2 minutes
      verbose: false
    };

    options = Object.assign(defaults, options);
    this.opts = options;
    
    this.channel = options.channel;
    this.messages = [];

    this.cooldownTime = Date.now();

    setInterval(() => {
      // each time, flush message queue and if enough trigger messages, send a trigger message
      const numOfTriggers = this.messages.map((message) => {
        if(this.opts.triggerMessage === message) {
          return message;
        }
      }).filter(e => !!e).length;
      this.messages = [];
      
      if(numOfTriggers > this.opts.numberOfTriggerMessages) {
        this.cooldownTime = Date.now();

        this.emit("trigger", {
          channel: this.channel,
          message: this.opts.triggerMessage
        });
      } else {
        console.log(`[flush] [${this.channel}] got ${numOfTriggers}/${this.opts.numberOfTriggerMessages} triggers`);
      }

      console.log(`[flush] ${this.channel}`);
    }, this.opts.timeToLive);
  }

  get onCooldown() {
    return (Date.now() - this.cooldownTime) < this.opts.cooldown;
  }

  parse(message) {
    const [parse, ] = message.split(/ /g);
    this.messages.push(parse);

    if(this.opts.verbose) console.log(`[parsed] [${this.channel}] ${parse}`)
  }
}

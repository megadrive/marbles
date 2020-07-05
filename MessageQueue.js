
const EventEmitter3 = require("eventemitter3");

module.exports = class MessageQueue extends EventEmitter3 {
  /**
   * 
   * @param {object} options 
   * @param {number} options.flushDelay How long in ms in between flushes
   * @param {number} options.numberOfTriggerMessages Number of message that will trigger a !play
   * @param {number} options.triggerMessage The message to send. default: "!play"
   * @param {number} options.cooldown Cooldown after message triggered in ms
   * @param {number} options.verbose Verbose debugging
   */
  constructor(options = {}) {
    super();

    const defaults = {
      flushDelay: 10 * 1000,
      numberOfTriggerMessages: 5,
      triggerMessage: "!play",
      cooldown: 3 * 60 * 1000, // 3 minutes
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
    }, this.opts.flushDelay);
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

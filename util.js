
/**
 * Twitch Params
 * @param {object} params
 */
module.exports.twitchParams = (twitchParams, options = {questionMark: false}) => {
  const params = [];

  /**
   * 
   * @param {string} str 
   */
  function stripLeadingHash(str) {
    if(str.indexOf("#") === 0) {
      return str.slice(1);
    }
    return str;
  }

  for(let k in twitchParams) {
    if(Array.isArray(twitchParams[k])) {
      twitchParams[k].map(p => {
        params.push(k + "=" + stripLeadingHash(p));
      });
    } else {
      params.push(k + "=" + stripLeadingHash(twitchParams[k]));
    }
  }
  return (options.questionMark ? "?" : "") + params.join("&");
}

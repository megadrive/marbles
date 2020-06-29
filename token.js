
const axios = require("axios");
const { readFile, writeFile } = require("mz/fs");
const { join } = require("path");

require("dotenv").config();

const {
  TWITCH_CLIENTID,
  TWITCH_SECRET
} = process.env;

async function getCachedData() {
  try {
    const fp = await readFile(join("token.json"), "utf8");
    const tokenData = JSON.parse(fp);
    tokenData.expiryDate = new Date(tokenData.expiryDate);
    return tokenData;
  } catch (err) {
    if(err.code === "ENOENT") {
      console.warn("No token.json.");
    } else {
      console.error(err);
    }
    return null;
  }
}

async function saveToCache(tokenData) {
  try {
    await writeFile(join("token.json"), JSON.stringify(tokenData));
    return true;
  } catch (err) {
    console.error("couldnt write to cached file", err);
    return null;
  }
}

module.exports.getToken = async function() {
  let cached;
  try {
    cached = await getCachedData();
  } catch (err) {
    console.error(err);
  }

  if(cached){
    const timeDiff = Date.now() - cached.expiryDate;
    if(timeDiff < (cached.expires_in * 1000)) {
      console.log("using cache");
      return cached;
    }
  }

  const searchParams = new URLSearchParams();
  searchParams.set("client_id", TWITCH_CLIENTID);
  searchParams.set("client_secret", TWITCH_SECRET);
  searchParams.set("grant_type", "client_credentials");

  try {
    const { data } = await axios.post("https://id.twitch.tv/oauth2/token?" + searchParams.toString());
    const tokenData = {
      expiryDate: Date.now() + (data.expires_in * 1000),
      ...data
    };
    saveToCache(tokenData);
    return tokenData;
  } catch(err) {
    console.log(err);
  }
};

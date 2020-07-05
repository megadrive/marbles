
const App = require("./app");

const app = new App({
  tickInterval: 2 * 60 * 1000,
  startWhenReady: true,
  streamFilter: (streamData) => {
    const { viewer_count } = streamData;
    return viewer_count <= 80 && viewer_count >= 10;
  },
  channels: []
});
app.create();

process.on("unhandledRejection", console.error);

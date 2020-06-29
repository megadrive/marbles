
const App = require("./app");

const app = new App({
  tickInterval: 15000,
  startWhenReady: true,
  streamFilter: (streamData) => {
    const { viewer_count } = streamData;
    return viewer_count <= 80 && viewer_count >= 10;
  }
});
app.create();

process.on("unhandledRejection", console.error);


const App = require("./app");

const app = new App();
app.create({
  tickInterval: 15000,
  startWhenReady: false
});

process.on("unhandledRejection", console.error);

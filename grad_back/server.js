const app = require("./app");

const PORT = process.env.PORT || 5155;

app.listen(PORT, () => {
  console.log(`Graduates system server running on port ${PORT}`);
});

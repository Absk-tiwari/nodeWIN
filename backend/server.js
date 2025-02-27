const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { Model } = require('objection');
const Knex = require('knex');
const path = require('path');

const knex = Knex({
  client: 'sqlite3',
  connection: {
    filename: path.join(__dirname, 'database/db.sqlite'),
  },
  useNullAsDefault: true,
});

Model.knex(knex);

const app = express();
const port = 5100;
const buildPath = path.join(__dirname, 'client/build');
app.use(cors());
app.use(express.json());
app.use('/images', express.static(path.join(__dirname, 'tmp')));
app.use(express.static(buildPath))

const db = new sqlite3.Database('./database/db.sqlite', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

app.use("/auth", require("./routes/auth"));
app.use("/products", require("./routes/products"));
app.use("/orders", require("./routes/orders"));
app.use("/category", require("./routes/category"));
app.use("/tax", require("./routes/tax"));
app.use("/pos", require("./routes/pos"));
app.use("/notes", require("./routes/notes"));
app.use("/config", require("./routes/config"));

app.get("/", (r, res) => res.send("Something went wrong!"));

let server
function start(){
  server = app.listen(port)
}

function stop(){
  server.close()
}

module.exports = {start, stop }
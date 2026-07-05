const app = require('./app');
const { env } = require('./config/env');

app.listen(env.port, () => {
  console.log(`Gringo Community API is running on http://localhost:${env.port}`);
});

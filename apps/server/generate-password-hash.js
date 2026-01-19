const bcrypt = require('bcrypt');

const password = process.argv[2] || 'testpassword123';
const rounds = 10;

bcrypt.hash(password, rounds, (err, hash) => {
  if (err) {
    process.stderr.write(
      `Error generating hash: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`${hash}\n`);
});

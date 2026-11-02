// Runs tests.js headless with the same script order as test.html: `node run-tests.js`
const fs = require("fs"), vm = require("vm"), path = require("path");
for (const f of ["logic.js", "menus.js", "tests.js"]) {
  const p = path.join(__dirname, f);
  if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, "utf8"), { filename: f });
}

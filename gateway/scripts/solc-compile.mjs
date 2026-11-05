// Compiles Solidity standard-JSON input from stdin with solc-js and prints the output JSON.
// Used by python/overdraft/solidity.py, so no native solc download is needed.
import solc from "solc";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => process.stdout.write(solc.compile(input)));

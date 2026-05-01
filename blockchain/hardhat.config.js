require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: "../.env" });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Định nghĩa network blockchain_network để khớp với lệnh bạn đã chạy
    blockchain_network: {
      url: process.env.RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // Network local (nếu bạn chạy npx hardhat node)
    localhost: {
      url: "http://127.0.0.1:8545",
    }
  },
};

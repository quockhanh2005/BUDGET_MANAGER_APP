const { ethers } = require("ethers");
require("dotenv").config({ path: "../../.env" });

async function check() {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const factoryAddr = process.env.VAULT_FACTORY_ADDRESS;
    const templateAddr = process.env.VAULT_TEMPLATE_ADDRESS;

    console.log(`Checking Factory: ${factoryAddr}`);
    const factoryCode = await provider.getCode(factoryAddr);
    console.log(`Factory Code Length: ${factoryCode.length}`);

    console.log(`Checking Template: ${templateAddr}`);
    const templateCode = await provider.getCode(templateAddr);
    console.log(`Template Code Length: ${templateCode.length}`);

    if (factoryCode !== "0x") {
        const factory = new ethers.Contract(factoryAddr, [
            "function activeVaultTemplate() view returns (address)"
        ], provider);
        try {
            const activeTemplate = await factory.activeVaultTemplate();
            console.log(`Active Template in Factory: ${activeTemplate}`);
            const activeCode = await provider.getCode(activeTemplate);
            console.log(`Active Template Code Length: ${activeCode.length}`);
        } catch (e) {
            console.log("Error calling activeVaultTemplate:", e.message);
        }
    }
}

check();

const { ethers } = require("ethers");

async function check() {
    const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
    const factoryAddr = "0x98664846FF5C23E71877528f5cd468cB9CA518Ef";
    const templateAddr = "0xb56bCf8Ca814910b68638E572cd1fbC9dCE77ee0";

    const provider = new ethers.JsonRpcProvider(RPC_URL);

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

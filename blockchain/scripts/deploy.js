/**
 * SCRIPT DEPLOY BLOCKCHAIN - Budget Manager App
 *
 * Luồng deploy bắt buộc (2 bước, theo thứ tự):
 *   Bước 1: Deploy SharedVault (hợp đồng mẫu / Template)
 *   Bước 2: Deploy VaultFactory (truyền địa chỉ của SharedVault vào)
 *
 * Cách chạy trên mạng cục bộ (local):
 *   1. Mở terminal 1: npx hardhat node
 *   2. Mở terminal 2: npx hardhat run scripts/deploy.js --network localhost
 *
 * Cách chạy trên testnet Sepolia (sau khi cấu hình .env):
 *   npx hardhat run scripts/deploy.js --network sepolia
 */

const { ethers } = require("hardhat");

async function main() {
  // Lấy danh sách tài khoản từ Hardhat (mạng local có sẵn 20 tài khoản test)
  const [deployer] = await ethers.getSigners();

  console.log("=====================================================");
  console.log("  BUDGET MANAGER - BLOCKCHAIN DEPLOYMENT");
  console.log("=====================================================");
  console.log(`Địa chỉ ví đang deploy: ${deployer.address}`);
  console.log(`Số dư ví: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log("-----------------------------------------------------");

  // =============================================================
  // BƯỚC 1: Deploy FundVault (Hợp đồng Mẫu / Template)
  //
  // Giải thích đơn giản:
  //   FundVault là "bản thiết kế" của mỗi Quỹ nhóm.
  //   FundFactory sẽ nhân bản (clone) từ bản thiết kế này.
  //   Hợp đồng mẫu này KHÔNG dùng trực tiếp, chỉ dùng để clone.
  // =============================================================
  console.log("\n[Bước 1/2] Đang deploy SharedVault (Template)...");
  const SharedVault = await ethers.getContractFactory("SharedVault");
  const sharedVaultTemplate = await SharedVault.deploy();
  await sharedVaultTemplate.waitForDeployment();

  const sharedVaultAddress = await sharedVaultTemplate.getAddress();
  console.log(`✅ SharedVault Template đã deploy tại: ${sharedVaultAddress}`);

  // =============================================================
  // BƯỚC 2: Deploy FundFactory (Nhà máy tạo Quỹ)
  //
  // Giải thích đơn giản:
  //   FundFactory nhận vào:
  //   - fundVaultAddress: địa chỉ bản thiết kế vừa tạo ở Bước 1
  //   - deployer.address: địa chỉ ví của admin (người quản lý Factory)
  // =============================================================
  console.log("\n[Bước 2/2] Đang deploy VaultFactory...");
  const VaultFactory = await ethers.getContractFactory("VaultFactory");
  const vaultFactory = await VaultFactory.deploy(sharedVaultAddress, deployer.address);
  await vaultFactory.waitForDeployment();

  const vaultFactoryAddress = await vaultFactory.getAddress();
  console.log(`✅ VaultFactory đã deploy tại: ${vaultFactoryAddress}`);

  // =============================================================
  // KẾT QUẢ - Các địa chỉ quan trọng cần lưu lại vào file .env
  // =============================================================
  console.log("\n=====================================================");
  console.log("  DEPLOYMENT THÀNH CÔNG!");
  console.log("=====================================================");
  console.log("⚠️  Hãy sao chép các địa chỉ sau vào file .env của Backend:");
  console.log(`\nVAULT_TEMPLATE_ADDRESS=${sharedVaultAddress}`);
  console.log(`VAULT_FACTORY_ADDRESS=${vaultFactoryAddress}`);
  console.log("=====================================================\n");
}

// Chạy hàm main và xử lý lỗi
main().catch((error) => {
  console.error("\n❌ LỖI TRONG QUÁ TRÌNH DEPLOY:");
  console.error(error);
  process.exitCode = 1;
});
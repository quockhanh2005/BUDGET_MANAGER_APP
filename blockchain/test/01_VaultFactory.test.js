// ============================================================
// TEST SUITE: VaultFactory.sol
// ============================================================
// Phạm vi kiểm tra:
//   - Deployment & khởi tạo Factory
//   - createFund(): tạo Vault clone mới
//   - upgradeTemplate(): nâng cấp template
//   - setExpenseManager(): thiết lập ExpenseManager
//   - pause() / unpause(): quản trị rủi ro
// ============================================================
const { expect } = require("chai");
const { ethers }  = require("hardhat");

// ─── Helpers ────────────────────────────────────────────────
/**
 * Deploy SharedVault template (không khởi tạo) và VaultFactory.
 * Trả về { factory, template, owner, alice, bob, carol, dave }
 */
async function deployFactoryFixture() {
  const [deployer, alice, bob, carol, dave] = await ethers.getSigners();

  // 1. Deploy SharedVault template (không gọi initialize)
  const VaultImpl = await ethers.getContractFactory("SharedVault");
  const vaultImpl = await VaultImpl.deploy();
  await vaultImpl.waitForDeployment();

  // 2. Deploy VaultFactory với template và owner là deployer
  const Factory = await ethers.getContractFactory("VaultFactory");
  const factory = await Factory.deploy(await vaultImpl.getAddress(), deployer.address);
  await factory.waitForDeployment();

  return { factory, vaultImpl, deployer, alice, bob, carol, dave };
}

// ============================================================
describe("VaultFactory", function () {

  // ─── 1. DEPLOYMENT ──────────────────────────────────────
  describe("1. Deployment & khởi tạo", function () {

    it("1.1 Deploy thành công: lưu đúng template và owner", async function () {
      const { factory, vaultImpl, deployer } = await deployFactoryFixture();

      expect(await factory.initialVaultTemplate()).to.equal(await vaultImpl.getAddress());
      expect(await factory.activeVaultTemplate()).to.equal(await vaultImpl.getAddress());
      expect(await factory.owner()).to.equal(deployer.address);
    });

    it("1.2 Revert khi truyền template là address(0)", async function () {
      const [deployer] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("VaultFactory");
      // Custom error: InvalidTemplate
      await expect(
        Factory.deploy(ethers.ZeroAddress, deployer.address)
      ).to.be.revertedWithCustomError(
        await ethers.getContractFactory("VaultFactory"),
        "InvalidTemplate"
      );
    });

    it("1.3 Revert khi truyền template là EOA (không có bytecode)", async function () {
      const [deployer, alice] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("VaultFactory");
      await expect(
        Factory.deploy(alice.address, deployer.address)
      ).to.be.revertedWithCustomError(
        await ethers.getContractFactory("VaultFactory"),
        "InvalidTemplate"
      );
    });

    it("1.4 expenseManager mặc định là address(0) sau khi deploy", async function () {
      const { factory } = await deployFactoryFixture();
      expect(await factory.expenseManager()).to.equal(ethers.ZeroAddress);
    });
  });

  // ─── 2. createFund ──────────────────────────────────────
  describe("2. createFund() — Tạo Vault clone", function () {

    it("2.1 Tạo fund thành công với 2 members, threshold=1", async function () {
      const { factory, deployer, alice } = await deployFactoryFixture();

      const members = [deployer.address, alice.address];
      const tx = await factory.createFund(members, 1);
      const receipt = await tx.wait();

      // Lấy địa chỉ vault từ event FundCreated
      const event = receipt.logs.find(
        l => l.fragment && l.fragment.name === "FundCreated"
      );
      expect(event).to.not.be.undefined;

      const fundAddress = event.args.fundAddress;
      expect(await factory.isFundFromFactory(fundAddress)).to.equal(true);
    });

    it("2.2 Event FundCreated phát sinh đúng tham số", async function () {
      const { factory, alice, bob, deployer } = await deployFactoryFixture();
      const members = [deployer.address, alice.address, bob.address];

      await expect(factory.connect(deployer).createFund(members, 2))
        .to.emit(factory, "FundCreated")
        .withArgs(
          (addr) => addr !== ethers.ZeroAddress,  // fundAddress != 0
          deployer.address,
          members,
          2,
          (ts) => ts > 0n  // timestamp > 0
        );
    });

    it("2.3 isFundFromFactory trả về false cho địa chỉ ngẫu nhiên", async function () {
      const { factory, alice } = await deployFactoryFixture();
      expect(await factory.isFundFromFactory(alice.address)).to.equal(false);
    });

    it("2.4 Revert khi members rỗng — EmptyMembers", async function () {
      const { factory } = await deployFactoryFixture();
      await expect(factory.createFund([], 1))
        .to.be.revertedWithCustomError(factory, "EmptyMembers");
    });

    it("2.5 Revert khi threshold = 0 — InvalidThreshold", async function () {
      const { factory, alice, bob } = await deployFactoryFixture();
      await expect(factory.createFund([alice.address, bob.address], 0))
        .to.be.revertedWithCustomError(factory, "InvalidThreshold");
    });

    it("2.6 Revert khi threshold > số members — InvalidThreshold", async function () {
      const { factory, alice, bob } = await deployFactoryFixture();
      // 2 members nhưng threshold=3
      await expect(factory.createFund([alice.address, bob.address], 3))
        .to.be.revertedWithCustomError(factory, "InvalidThreshold");
    });

    it("2.7 Revert khi có member là address(0) — InvalidMember", async function () {
      const { factory, alice } = await deployFactoryFixture();
      await expect(factory.createFund([alice.address, ethers.ZeroAddress], 1))
        .to.be.revertedWithCustomError(factory, "InvalidMember");
    });

    it("2.8 Revert khi có member trùng lặp — DuplicateMember", async function () {
      const { factory, alice } = await deployFactoryFixture();
      await expect(factory.createFund([alice.address, alice.address], 1))
        .to.be.revertedWithCustomError(factory, "DuplicateMember");
    });

    it("2.9 Revert khi số members vượt quá MAX_MEMBERS (20)", async function () {
      const { factory, deployer } = await deployFactoryFixture();
      // Tạo mảng 21 địa chỉ duy nhất
      const tooMany = [deployer.address];
      for(let i = 0; i < 20; i++) {
        tooMany.push(ethers.Wallet.createRandom().address);
      }
      await expect(factory.createFund(tooMany, 1))
        .to.be.revertedWithCustomError(factory, "InvalidThreshold");
    });

    it("2.10 Revert khi factory đang bị Pause — whenNotPaused", async function () {
      const { factory, alice, bob } = await deployFactoryFixture();
      await factory.pause();
      await expect(factory.createFund([alice.address, bob.address], 1))
        .to.be.revertedWithCustomError(factory, "EnforcedPause");
    });

    it("2.11 Có thể tạo fund sau khi Unpause", async function () {
      const { factory, deployer, bob } = await deployFactoryFixture();
      await factory.pause();
      await factory.unpause();
      // Không revert
      await expect(factory.createFund([deployer.address, bob.address], 1)).to.not.be.reverted;
    });

    it("2.12 Mỗi lần createFund sinh ra địa chỉ clone khác nhau", async function () {
      const { factory, deployer, alice, bob } = await deployFactoryFixture();
      const members = [deployer.address, alice.address];

      const tx1 = await factory.connect(deployer).createFund(members, 1);
      const r1 = await tx1.wait();
      const addr1 = r1.logs.find(l => l.fragment?.name === "FundCreated").args.fundAddress;

      const tx2 = await factory.connect(bob).createFund([bob.address, alice.address], 1);
      const r2 = await tx2.wait();
      const addr2 = r2.logs.find(l => l.fragment?.name === "FundCreated").args.fundAddress;

      expect(addr1).to.not.equal(addr2);
    });
  });

  // ─── 3. upgradeTemplate ─────────────────────────────────
  describe("3. upgradeTemplate() — Nâng cấp template", function () {

    it("3.1 Owner nâng cấp template thành công", async function () {
      const { factory, deployer } = await deployFactoryFixture();

      // Deploy template mới (SharedVault khác)
      const VaultV2 = await ethers.getContractFactory("SharedVault");
      const vaultV2 = await VaultV2.deploy();
      await vaultV2.waitForDeployment();

      const oldTemplate = await factory.activeVaultTemplate();
      await expect(factory.connect(deployer).upgradeTemplate(await vaultV2.getAddress()))
        .to.emit(factory, "TemplateUpgraded")
        .withArgs(oldTemplate, await vaultV2.getAddress(), (ts) => ts > 0n);

      expect(await factory.activeVaultTemplate()).to.equal(await vaultV2.getAddress());
    });

    it("3.2 Revert khi non-owner cố nâng cấp template", async function () {
      const { factory, alice } = await deployFactoryFixture();
      const VaultV2 = await ethers.getContractFactory("SharedVault");
      const vaultV2 = await VaultV2.deploy();
      await vaultV2.waitForDeployment();

      await expect(factory.connect(alice).upgradeTemplate(await vaultV2.getAddress()))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("3.3 Revert khi nâng cấp với template giống template hiện tại — InvalidTemplate", async function () {
      const { factory, vaultImpl } = await deployFactoryFixture();
      await expect(factory.upgradeTemplate(await vaultImpl.getAddress()))
        .to.be.revertedWithCustomError(factory, "InvalidTemplate");
    });

    it("3.4 Revert khi nâng cấp với address(0) — InvalidTemplate", async function () {
      const { factory } = await deployFactoryFixture();
      await expect(factory.upgradeTemplate(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "InvalidTemplate");
    });

    it("3.5 initialVaultTemplate không thay đổi sau upgrade (immutable)", async function () {
      const { factory, vaultImpl, deployer } = await deployFactoryFixture();
      const initialTemplate = await factory.initialVaultTemplate();

      const VaultV2 = await ethers.getContractFactory("SharedVault");
      const vaultV2 = await VaultV2.deploy();
      await vaultV2.waitForDeployment();
      await factory.upgradeTemplate(await vaultV2.getAddress());

      expect(await factory.initialVaultTemplate()).to.equal(initialTemplate);
    });
  });

  // ─── 4. setExpenseManager ───────────────────────────────
  describe("4. setExpenseManager()", function () {

    it("4.1 Owner thiết lập ExpenseManager thành công", async function () {
      const { factory, alice } = await deployFactoryFixture();
      await factory.setExpenseManager(alice.address);
      expect(await factory.expenseManager()).to.equal(alice.address);
    });

    it("4.2 Revert khi non-owner gọi setExpenseManager", async function () {
      const { factory, alice, bob } = await deployFactoryFixture();
      await expect(factory.connect(alice).setExpenseManager(bob.address))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("4.3 Fund tạo sau khi setExpenseManager sẽ được truyền địa chỉ EM", async function () {
      const { factory, deployer, alice, bob } = await deployFactoryFixture();
      await factory.setExpenseManager(alice.address); // giả lập EM

      const members = [deployer.address, bob.address];
      const tx = await factory.connect(deployer).createFund(members, 1);
      const receipt = await tx.wait();
      const fundAddress = receipt.logs.find(l => l.fragment?.name === "FundCreated").args.fundAddress;

      // Vault được clone và initialize với expenseManager=alice.address
      const vault = await ethers.getContractAt("SharedVault", fundAddress);
      expect(await vault.expenseManager()).to.equal(alice.address);
    });
  });

  // ─── 5. Pause / Unpause ─────────────────────────────────
  describe("5. pause() / unpause()", function () {

    it("5.1 Revert khi non-owner gọi pause", async function () {
      const { factory, alice } = await deployFactoryFixture();
      await expect(factory.connect(alice).pause())
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("5.2 Revert khi non-owner gọi unpause", async function () {
      const { factory, alice } = await deployFactoryFixture();
      await factory.pause();
      await expect(factory.connect(alice).unpause())
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

});

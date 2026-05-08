// ============================================================
// TEST SUITE: ExpenseManager.sol
// ============================================================
// Phạm vi kiểm tra:
//   - Deployment & constructor validation
//   - setCategoryLimit(): thiết lập hạn mức
//   - deactivateCategory(): vô hiệu hóa danh mục
//   - validateTransaction(): kiểm duyệt giao dịch & cộng dồn
//   - getCategoryInfo(): query dữ liệu (view function)
//   - Access Control: onlyRegisteredVault modifier
// ============================================================
const { expect }  = require("chai");
const { ethers }  = require("hardhat");

// ─── Helpers ────────────────────────────────────────────────
/**
 * Deploy VaultFactory + ExpenseManager + một SharedVault thật.
 * SharedVault được tạo qua Factory nên sẽ pass onlyRegisteredVault.
 *
 * Returns:
 *   factory, expenseManager, vault (SharedVault proxy), vaultAddress
 *   deployer (owner của vault), alice, bob
 */
async function deployEMFixture() {
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  // ── 1. Deploy SharedVault template ──
  const VaultImpl = await ethers.getContractFactory("SharedVault");
  const vaultImpl = await VaultImpl.deploy();
  await vaultImpl.waitForDeployment();

  // ── 2. Deploy VaultFactory ──
  const Factory = await ethers.getContractFactory("VaultFactory");
  const factory = await Factory.deploy(await vaultImpl.getAddress(), deployer.address);
  await factory.waitForDeployment();

  // ── 3. Deploy ExpenseManager với factory là dependency ──
  const EM = await ethers.getContractFactory("ExpenseManager");
  const em = await EM.deploy(await factory.getAddress());
  await em.waitForDeployment();

  // ── 4. Đăng ký ExpenseManager vào Factory để các vault mới dùng được ──
  await factory.setExpenseManager(await em.getAddress());

  // ── 5. Tạo vault thực qua Factory (sẽ được đánh dấu isFundFromFactory) ──
  //    Vault này có deployer=owner, alice=member, threshold=1
  const members = [deployer.address, alice.address];
  const tx = await factory.connect(deployer).createFund(members, 1);
  const receipt = await tx.wait();
  const vaultAddress = receipt.logs
    .find(l => l.fragment?.name === "FundCreated")
    .args.fundAddress;

  const vault = await ethers.getContractAt("SharedVault", vaultAddress);

  return { factory, em, vault, vaultAddress, deployer, alice, bob, carol };
}

// ─── Helper: Ký WithdrawRequest (EIP-712) ───────────────────
async function signWithdraw(vault, signer, { to, amount, categoryId, nonce, deadline }) {
  const domain = {
    name: "SharedVault",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await vault.getAddress(),
  };
  const types = {
    WithdrawRequest: [
      { name: "to",         type: "address" },
      { name: "amount",     type: "uint256" },
      { name: "categoryId", type: "uint256" },
      { name: "nonce",      type: "uint256" },
      { name: "deadline",   type: "uint256" },
    ],
  };
  return signer.signTypedData(domain, types, { to, amount, categoryId, nonce, deadline });
}

// ─── Helper: Ký SetCategoryLimitRequest ─────────────────────
async function signSetCategoryLimit(vault, signer, { categoryId, limitAmount, nonce, deadline }) {
  const domain = {
    name: "SharedVault",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await vault.getAddress(),
  };
  const types = {
    SetCategoryLimitRequest: [
      { name: "categoryId",   type: "uint256" },
      { name: "limitAmount",  type: "uint256" },
      { name: "nonce",        type: "uint256" },
      { name: "deadline",     type: "uint256" },
    ],
  };
  return signer.signTypedData(domain, types, { categoryId, limitAmount, nonce, deadline });
}

// ============================================================
describe("ExpenseManager", function () {

  // ─── 1. DEPLOYMENT ──────────────────────────────────────
  describe("1. Deployment & constructor", function () {

    it("1.1 Deploy thành công: lưu đúng địa chỉ vaultFactory", async function () {
      const { em, factory } = await deployEMFixture();
      expect(await em.vaultFactory()).to.equal(await factory.getAddress());
    });

    it("1.2 Revert khi constructor nhận factory = address(0)", async function () {
      const EM = await ethers.getContractFactory("ExpenseManager");
      await expect(EM.deploy(ethers.ZeroAddress))
        .to.be.revertedWith("ExpenseManager: Factory address khong hop le");
    });
  });

  // ─── 2. setCategoryLimit ────────────────────────────────
  describe("2. setCategoryLimit() — Thiết lập hạn mức (qua SharedVault)", function () {

    it("2.1 Vault hợp lệ thiết lập limit thành công; event phát sinh", async function () {
      const { em, vault, deployer, alice } = await deployEMFixture();

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce    = 1;
      const catId    = 10;
      const limit    = ethers.parseEther("5");

      // Cần ít nhất threshold=1 chữ ký của member. alice là member
      const sig = await signSetCategoryLimit(vault, alice, {
        categoryId: catId, limitAmount: limit, nonce, deadline,
      });

      await expect(
        vault.executeSetCategoryLimit(catId, limit, nonce, deadline, [sig])
      )
        .to.emit(em, "CategoryLimitUpdated")
        .withArgs(await vault.getAddress(), catId, limit, (ts) => ts > 0n);

      // Kiểm tra state lưu đúng
      const info = await em.getCategoryInfo(await vault.getAddress(), catId);
      expect(info.limitAmount).to.equal(limit);
      expect(info.amountSpent).to.equal(0n);
      expect(info.isActive).to.equal(true);
    });

    it("2.2 Revert khi EOA trực tiếp gọi setCategoryLimit — không phải vault hợp lệ", async function () {
      const { em, alice } = await deployEMFixture();
      await expect(em.connect(alice).setCategoryLimit(1, ethers.parseEther("1")))
        .to.be.revertedWith("ExpenseManager: Caller khong phai Vault hop le");
    });

    it("2.3 Revert khi limitAmount = 0 — limit phải > 0", async function () {
      const { em, vault, alice } = await deployEMFixture();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = 2;
      const catId = 1;
      const sig = await signSetCategoryLimit(vault, alice, {
        categoryId: catId, limitAmount: 0n, nonce, deadline,
      });
      await expect(
        vault.executeSetCategoryLimit(catId, 0n, nonce, deadline, [sig])
      ).to.be.revertedWith("ExpenseManager: Han muc phai lon hon 0");
    });

    it("2.4 Gọi setCategoryLimit lần 2 cập nhật (overwrite) limit mới", async function () {
      const { em, vault, alice } = await deployEMFixture();
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const catId = 5;

      // Lần 1
      const sig1 = await signSetCategoryLimit(vault, alice, {
        categoryId: catId, limitAmount: ethers.parseEther("1"), nonce: 3, deadline,
      });
      await vault.executeSetCategoryLimit(catId, ethers.parseEther("1"), 3, deadline, [sig1]);

      // Lần 2 (nonce mới)
      const sig2 = await signSetCategoryLimit(vault, alice, {
        categoryId: catId, limitAmount: ethers.parseEther("5"), nonce: 4, deadline,
      });
      await vault.executeSetCategoryLimit(catId, ethers.parseEther("5"), 4, deadline, [sig2]);

      const info = await em.getCategoryInfo(await vault.getAddress(), catId);
      expect(info.limitAmount).to.equal(ethers.parseEther("5"));
      // isActive = true sau khi cập nhật
      expect(info.isActive).to.equal(true);
    });
  });

  // ─── 3. deactivateCategory ──────────────────────────────
  describe("3. deactivateCategory() — Vô hiệu hóa danh mục", function () {

    async function setupActiveCategory(vault, alice) {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const catId = 20;
      const nonce = 10;
      const sig = await signSetCategoryLimit(vault, alice, {
        categoryId: catId, limitAmount: ethers.parseEther("3"), nonce, deadline,
      });
      await vault.executeSetCategoryLimit(catId, ethers.parseEther("3"), nonce, deadline, [sig]);
      return catId;
    }

    it("3.1 Vault hợp lệ vô hiệu hóa danh mục đang active", async function () {
      const { em, vault, alice } = await deployEMFixture();
      const catId = await setupActiveCategory(vault, alice);

      // Vault tự gọi deactivateCategory (qua mock caller)
      // → Vault không có hàm wrap deactivateCategory, nên ta impersonate vault address
      await ethers.provider.send("hardhat_impersonateAccount", [await vault.getAddress()]);
      await ethers.provider.send("hardhat_setBalance", [
        await vault.getAddress(),
        "0x1000000000000000000",
      ]);
      const vaultSigner = await ethers.getSigner(await vault.getAddress());

      await em.connect(vaultSigner).deactivateCategory(catId);
      const info = await em.getCategoryInfo(await vault.getAddress(), catId);
      expect(info.isActive).to.equal(false);

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [await vault.getAddress()]);
    });

    it("3.2 Revert khi EOA trực tiếp gọi deactivateCategory", async function () {
      const { em, alice } = await deployEMFixture();
      await expect(em.connect(alice).deactivateCategory(1))
        .to.be.revertedWith("ExpenseManager: Caller khong phai Vault hop le");
    });

    it("3.3 Revert khi gọi deactivate cho danh mục đã inactive", async function () {
      const { em, vault, alice } = await deployEMFixture();
      const catId = await setupActiveCategory(vault, alice);

      // Deactivate lần 1
      await ethers.provider.send("hardhat_impersonateAccount", [await vault.getAddress()]);
      await ethers.provider.send("hardhat_setBalance", [
        await vault.getAddress(), "0x1000000000000000000",
      ]);
      const vaultSigner = await ethers.getSigner(await vault.getAddress());
      await em.connect(vaultSigner).deactivateCategory(catId);

      // Deactivate lần 2 → revert
      await expect(em.connect(vaultSigner).deactivateCategory(catId))
        .to.be.revertedWith("ExpenseManager: Danh muc da bi vo hieu hoa");

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [await vault.getAddress()]);
    });
  });

  // ─── 4. validateTransaction ─────────────────────────────
  describe("4. validateTransaction() — Kiểm duyệt giao dịch rút tiền", function () {

    /**
     * Setup: Nạp tiền vào vault, thiết lập limit cho catId, trả về các tham số cần thiết.
     */
    async function setupForWithdraw(vault, alice, catId = 30, limitEth = "2") {
      // Nạp tiền vào vault
      await alice.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("10") });

      // Thiết lập limit
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const setNonce = 100 + catId;
      const sig = await signSetCategoryLimit(vault, alice, {
        categoryId: catId,
        limitAmount: ethers.parseEther(limitEth),
        nonce: setNonce,
        deadline,
      });
      await vault.executeSetCategoryLimit(catId, ethers.parseEther(limitEth), setNonce, deadline, [sig]);
      return { deadline, catId };
    }

    it("4.1 validateTransaction thành công: amountSpent được cộng dồn", async function () {
      const { em, vault, alice, bob } = await deployEMFixture();
      const { catId, deadline } = await setupForWithdraw(vault, alice, 30, "3");

      const withdrawAmount = ethers.parseEther("1");
      const withdrawNonce  = 200;

      const sig = await signWithdraw(vault, alice, {
        to: bob.address, amount: withdrawAmount, categoryId: catId,
        nonce: withdrawNonce, deadline,
      });

      await vault.executeWithdraw(bob.address, withdrawAmount, catId, withdrawNonce, deadline, [sig]);

      const info = await em.getCategoryInfo(await vault.getAddress(), catId);
      expect(info.amountSpent).to.equal(withdrawAmount);
      expect(info.remaining).to.equal(ethers.parseEther("2")); // 3-1=2
    });

    it("4.2 Rút nhiều lần cộng dồn amountSpent đúng", async function () {
      const { em, vault, alice, bob } = await deployEMFixture();
      const { catId, deadline } = await setupForWithdraw(vault, alice, 31, "3");

      const amount = ethers.parseEther("1");

      // Rút lần 1
      const sig1 = await signWithdraw(vault, alice, {
        to: bob.address, amount, categoryId: catId, nonce: 201, deadline,
      });
      await vault.executeWithdraw(bob.address, amount, catId, 201, deadline, [sig1]);

      // Rút lần 2
      const sig2 = await signWithdraw(vault, alice, {
        to: bob.address, amount, categoryId: catId, nonce: 202, deadline,
      });
      await vault.executeWithdraw(bob.address, amount, catId, 202, deadline, [sig2]);

      const info = await em.getCategoryInfo(await vault.getAddress(), catId);
      expect(info.amountSpent).to.equal(ethers.parseEther("2"));
    });

    it("4.3 Revert khi vượt quá hạn mức (Hard Limit)", async function () {
      const { vault, alice, bob } = await deployEMFixture();
      const { catId, deadline } = await setupForWithdraw(vault, alice, 32, "1");

      // Cố rút 2 ETH trong khi limit chỉ 1 ETH
      const sig = await signWithdraw(vault, alice, {
        to: bob.address, amount: ethers.parseEther("2"), categoryId: catId,
        nonce: 203, deadline,
      });
      await expect(
        vault.executeWithdraw(bob.address, ethers.parseEther("2"), catId, 203, deadline, [sig])
      ).to.be.revertedWith("ExpenseManager: Tu choi -- Vuot qua han muc danh muc");
    });

    it("4.4 Revert khi danh mục không active (deactivated)", async function () {
      const { em, vault, alice, bob } = await deployEMFixture();
      const { catId, deadline } = await setupForWithdraw(vault, alice, 33, "5");

      // Deactivate category
      await ethers.provider.send("hardhat_impersonateAccount", [await vault.getAddress()]);
      await ethers.provider.send("hardhat_setBalance", [
        await vault.getAddress(), "0x1000000000000000000",
      ]);
      const vaultSigner = await ethers.getSigner(await vault.getAddress());
      await em.connect(vaultSigner).deactivateCategory(catId);
      await ethers.provider.send("hardhat_stopImpersonatingAccount", [await vault.getAddress()]);

      const sig = await signWithdraw(vault, alice, {
        to: bob.address, amount: ethers.parseEther("1"), categoryId: catId,
        nonce: 204, deadline,
      });
      await expect(
        vault.executeWithdraw(bob.address, ethers.parseEther("1"), catId, 204, deadline, [sig])
      ).to.be.revertedWith("ExpenseManager: Tu choi -- Danh muc khong hoat dong");
    });

    it("4.5 Revert khi EOA trực tiếp gọi validateTransaction — onlyRegisteredVault", async function () {
      const { em, alice } = await deployEMFixture();
      await expect(em.connect(alice).validateTransaction(1, ethers.parseEther("1")))
        .to.be.revertedWith("ExpenseManager: Caller khong phai Vault hop le");
    });

    it("4.6 Rút đúng bằng limit không revert (edge case: spent == limit)", async function () {
      const { vault, alice, bob } = await deployEMFixture();
      const { catId, deadline } = await setupForWithdraw(vault, alice, 34, "1");

      const sig = await signWithdraw(vault, alice, {
        to: bob.address, amount: ethers.parseEther("1"), categoryId: catId,
        nonce: 205, deadline,
      });
      // Không revert
      await expect(
        vault.executeWithdraw(bob.address, ethers.parseEther("1"), catId, 205, deadline, [sig])
      ).to.not.be.reverted;
    });
  });

  // ─── 5. getCategoryInfo ─────────────────────────────────
  describe("5. getCategoryInfo() — Query dữ liệu (view)", function () {

    it("5.1 Trả về giá trị mặc định cho danh mục chưa thiết lập", async function () {
      const { em, vaultAddress } = await deployEMFixture();
      const info = await em.getCategoryInfo(vaultAddress, 999);
      expect(info.limitAmount).to.equal(0n);
      expect(info.amountSpent).to.equal(0n);
      expect(info.remaining).to.equal(0n);
      expect(info.isActive).to.equal(false);
    });

    it("5.2 remaining = 0 khi amountSpent >= limitAmount (không âm)", async function () {
      const { em, vault, alice, bob } = await deployEMFixture();
      const catId   = 40;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Thiết lập limit = 1 ETH
      const sigSet = await signSetCategoryLimit(vault, alice, {
        categoryId: catId, limitAmount: ethers.parseEther("1"), nonce: 300, deadline,
      });
      await vault.executeSetCategoryLimit(catId, ethers.parseEther("1"), 300, deadline, [sigSet]);

      // Nạp tiền
      await alice.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("5") });

      // Rút hết limit
      const sigW = await signWithdraw(vault, alice, {
        to: bob.address, amount: ethers.parseEther("1"), categoryId: catId,
        nonce: 301, deadline,
      });
      await vault.executeWithdraw(bob.address, ethers.parseEther("1"), catId, 301, deadline, [sigW]);

      const info = await em.getCategoryInfo(await vault.getAddress(), catId);
      expect(info.remaining).to.equal(0n); // 0, không âm
    });

    it("5.3 Bất kỳ ai đều có thể đọc getCategoryInfo (public view)", async function () {
      const { em, vaultAddress, carol } = await deployEMFixture();
      // carol không phải member, không phải vault — vẫn đọc được
      await expect(em.connect(carol).getCategoryInfo(vaultAddress, 1)).to.not.be.reverted;
    });
  });

  // ─── 6. EVENTS ──────────────────────────────────────────
  describe("6. Events phát sinh đúng", function () {

    it("6.1 VaultActivity emit khi setCategoryLimit thành công", async function () {
      const { em, vault, alice } = await deployEMFixture();
      const catId   = 50;
      const limit   = ethers.parseEther("2");
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      const sig = await signSetCategoryLimit(vault, alice, {
        categoryId: catId, limitAmount: limit, nonce: 400, deadline,
      });

      await expect(vault.executeSetCategoryLimit(catId, limit, 400, deadline, [sig]))
        .to.emit(em, "VaultActivity")
        .withArgs(await vault.getAddress(), "SET_LIMIT", catId, limit, (actor) => true);
    });

    it("6.2 ExpenseValidated + VaultActivity emit khi validateTransaction thành công", async function () {
      const { em, vault, alice, bob } = await deployEMFixture();
      const catId    = 51;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const limitEth = ethers.parseEther("5");
      const amount   = ethers.parseEther("1");

      await alice.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther("10") });

      const sigSet = await signSetCategoryLimit(vault, alice, {
        categoryId: catId, limitAmount: limitEth, nonce: 401, deadline,
      });
      await vault.executeSetCategoryLimit(catId, limitEth, 401, deadline, [sigSet]);

      const sigW = await signWithdraw(vault, alice, {
        to: bob.address, amount, categoryId: catId, nonce: 402, deadline,
      });

      const tx = vault.executeWithdraw(bob.address, amount, catId, 402, deadline, [sigW]);

      await expect(tx).to.emit(em, "ExpenseValidated")
        .withArgs(await vault.getAddress(), catId, amount, amount, "Chi tieu hop le");

      await expect(tx).to.emit(em, "VaultActivity")
        .withArgs(await vault.getAddress(), "WITHDRAW", catId, amount, (actor) => true);
    });
  });
});

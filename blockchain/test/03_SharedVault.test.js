// ============================================================
// TEST SUITE: SharedVault.sol
// ============================================================
const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployVaultFixture() {
  const [owner, alice, bob, nonMember] = await ethers.getSigners();

  // Deploy VaultImpl
  const VaultImpl = await ethers.getContractFactory("SharedVault");
  const vaultImpl = await VaultImpl.deploy();
  await vaultImpl.waitForDeployment();

  // Deploy Factory
  const Factory = await ethers.getContractFactory("VaultFactory");
  const factory = await Factory.deploy(await vaultImpl.getAddress(), owner.address);
  await factory.waitForDeployment();

  // Create Vault via Factory
  const members = [owner.address, alice.address, bob.address];
  const tx = await factory.createFund(members, 2);
  const receipt = await tx.wait();
  const event = receipt.logs.find(l => l.fragment?.name === "FundCreated");
  const vaultAddress = event.args.fundAddress;

  const vault = await ethers.getContractAt("SharedVault", vaultAddress);
  
  return { vault, vaultAddress, owner, alice, bob, nonMember, factory };
}

// EIP-712 Signature Helpers
async function signTypedData(vault, signer, typeName, types, value) {
  const domain = {
    name: "SharedVault",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await vault.getAddress(),
  };
  return signer.signTypedData(domain, { [typeName]: types }, value);
}

describe("SharedVault", function () {
  describe("1. Initialization & Roles", function () {
    it("1.1 Initializes correctly with owner and members", async function () {
      const { vault, owner, alice, bob } = await deployVaultFixture();
      expect(await vault.owner()).to.equal(owner.address);
      expect(await vault.threshold()).to.equal(2);
      expect(await vault.activeMemberCount()).to.equal(3);
      expect(await vault.isMember(owner.address)).to.be.true;
      expect(await vault.isMember(alice.address)).to.be.true;
      expect(await vault.isMember(bob.address)).to.be.true;
    });

    it("1.2 Cannot initialize twice", async function () {
      const { vault, owner, alice } = await deployVaultFixture();
      await expect(vault.initialize(owner.address, [owner.address, alice.address], 2, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(vault, "InvalidInitialization");
    });
  });

  describe("2. Deposits", function () {
    it("2.1 Accepts direct ETH deposits (receive)", async function () {
      const { vault, vaultAddress, nonMember } = await deployVaultFixture();
      const amount = ethers.parseEther("1.0");
      await expect(nonMember.sendTransaction({ to: vaultAddress, value: amount }))
        .to.emit(vault, "Deposit")
        .withArgs(nonMember.address, nonMember.address, amount);
      expect(await vault.getBalance()).to.equal(amount);
    });

    it("2.2 Accepts deposits via depositFor", async function () {
      const { vault, nonMember, alice } = await deployVaultFixture();
      const amount = ethers.parseEther("2.0");
      await expect(vault.connect(nonMember).depositFor(alice.address, { value: amount }))
        .to.emit(vault, "Deposit")
        .withArgs(nonMember.address, alice.address, amount);
      expect(await vault.getBalance()).to.equal(amount);
    });
  });

  describe("3. Withdrawals", function () {
    it("3.1 Executes withdrawal with valid signatures (threshold met)", async function () {
      const { vault, vaultAddress, owner, alice, nonMember } = await deployVaultFixture();
      
      // Deposit funds
      await owner.sendTransaction({ to: vaultAddress, value: ethers.parseEther("5") });
      
      const amount = ethers.parseEther("1");
      const categoryId = 1;
      const nonce = 1;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      const types = [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "categoryId", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ];
      const value = { to: nonMember.address, amount, categoryId, nonce, deadline };
      
      // We need 2 signatures (threshold = 2). Order matters: sort signers by address
      let signers = [owner, alice].sort((a, b) => a.address.localeCompare(b.address));
      const sig1 = await signTypedData(vault, signers[0], "WithdrawRequest", types, value);
      const sig2 = await signTypedData(vault, signers[1], "WithdrawRequest", types, value);
      
      await expect(vault.executeWithdraw(nonMember.address, amount, categoryId, nonce, deadline, [sig1, sig2]))
        .to.emit(vault, "WithdrawExecuted")
        .withArgs(nonce, nonMember.address, amount, categoryId);
        
      expect(await vault.getBalance()).to.equal(ethers.parseEther("4"));
      expect(await vault.executedNonces(nonce)).to.be.true;
    });

    it("3.2 Reverts with insufficient signatures", async function () {
      const { vault, vaultAddress, owner, nonMember } = await deployVaultFixture();
      await owner.sendTransaction({ to: vaultAddress, value: ethers.parseEther("5") });
      
      const amount = ethers.parseEther("1");
      const nonce = 2;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      const types = [
        { name: "to", type: "address" }, { name: "amount", type: "uint256" },
        { name: "categoryId", type: "uint256" }, { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ];
      const value = { to: nonMember.address, amount, categoryId: 1, nonce, deadline };
      const sig1 = await signTypedData(vault, owner, "WithdrawRequest", types, value);
      
      await expect(vault.executeWithdraw(nonMember.address, amount, 1, nonce, deadline, [sig1]))
        .to.be.revertedWith("Khong du so luong chu ky");
    });
  });

  describe("4. Close Fund", function () {
    it("4.1 Closes fund successfully with owner signature", async function () {
      const { vault, owner, alice } = await deployVaultFixture();
      
      const nonce = 1;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const types = [
        { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }
      ];
      const value = { nonce, deadline };
      
      let signers = [owner, alice].sort((a, b) => a.address.localeCompare(b.address));
      const sig1 = await signTypedData(vault, signers[0], "CloseFundRequest", types, value);
      const sig2 = await signTypedData(vault, signers[1], "CloseFundRequest", types, value);
      
      await expect(vault.executeCloseFund(nonce, deadline, [sig1, sig2]))
        .to.emit(vault, "FundClosed");
      
      expect(await vault.state()).to.equal(3); // Closed
    });

    it("4.2 Reverts if owner signature is missing", async function () {
      const { vault, alice, bob } = await deployVaultFixture();
      
      const nonce = 2;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const types = [
        { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }
      ];
      const value = { nonce, deadline };
      
      let signers = [alice, bob].sort((a, b) => a.address.localeCompare(b.address));
      const sig1 = await signTypedData(vault, signers[0], "CloseFundRequest", types, value);
      const sig2 = await signTypedData(vault, signers[1], "CloseFundRequest", types, value);
      
      await expect(vault.executeCloseFund(nonce, deadline, [sig1, sig2]))
        .to.be.revertedWith("Bat buoc phai co chu ky cua Owner de dong quy");
    });
  });

  describe("5. Member Management", function () {
    it("5.1 Adds a new member successfully", async function () {
      const { vault, owner, alice, nonMember } = await deployVaultFixture();
      
      const nonce = 1;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const newThreshold = 3;
      
      const types = [
        { name: "newMember", type: "address" }, { name: "newThreshold", type: "uint256" },
        { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }
      ];
      const value = { newMember: nonMember.address, newThreshold, nonce, deadline };
      
      let signers = [owner, alice].sort((a, b) => a.address.localeCompare(b.address));
      const sig1 = await signTypedData(vault, signers[0], "AddMemberRequest", types, value);
      const sig2 = await signTypedData(vault, signers[1], "AddMemberRequest", types, value);
      
      await expect(vault.executeAddMember(nonMember.address, newThreshold, nonce, deadline, [sig1, sig2]))
        .to.emit(vault, "MemberAdded")
        .withArgs(nonMember.address, newThreshold);
        
      expect(await vault.isMember(nonMember.address)).to.be.true;
      expect(await vault.activeMemberCount()).to.equal(4);
      expect(await vault.threshold()).to.equal(3);
    });

    it("5.2 Removes a member successfully", async function () {
      const { vault, owner, alice, bob } = await deployVaultFixture();
      
      const nonce = 2;
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const newThreshold = 2;
      
      const types = [
        { name: "oldMember", type: "address" }, { name: "newThreshold", type: "uint256" },
        { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }
      ];
      const value = { oldMember: bob.address, newThreshold, nonce, deadline };
      
      let signers = [owner, alice].sort((a, b) => a.address.localeCompare(b.address));
      const sig1 = await signTypedData(vault, signers[0], "RemoveMemberRequest", types, value);
      const sig2 = await signTypedData(vault, signers[1], "RemoveMemberRequest", types, value);
      
      await expect(vault.executeRemoveMember(bob.address, newThreshold, nonce, deadline, [sig1, sig2]))
        .to.emit(vault, "MemberRemoved")
        .withArgs(bob.address, newThreshold);
        
      expect(await vault.isMember(bob.address)).to.be.false;
      expect(await vault.activeMemberCount()).to.equal(2);
      expect(await vault.threshold()).to.equal(2);
    });
  });
});

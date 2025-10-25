import { assert, expect } from "chai";
import { network } from "hardhat";
import Network from "./helpers/network.js";

const { ethers } = await network.connect();

describe("NFT", function () {
  let accounts;
  let owner;
  let creator;
  let treasury;
  let buyer1;
  let buyer2;
  let factory;
  let mockPyUsd;
  let nft;
  let networkHelper;
  let futureTimestamp;

  const startPrice = ethers.parseUnits("25", 6);
  const priceIncrement = 5;
  const platformFee = 10;
  const baseUri = "https://placeholder.com/";
  const minRequiredSales = 10;

  before("setup", async function () {
    networkHelper = new Network();
    accounts = await ethers.getSigners();
    owner = accounts[0];
    creator = accounts[1];
    treasury = accounts[2];
    buyer1 = accounts[3];
    buyer2 = accounts[4];
  });

  beforeEach(async function () {
    const MockPYUSD = await ethers.getContractFactory("MockPYUSD");
    mockPyUsd = await MockPYUSD.deploy("PyUSD", "PYUSD", 6);
    await mockPyUsd.waitForDeployment();

    const Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy(treasury.address, platformFee, baseUri);
    await factory.waitForDeployment();

    const currentBlock = await ethers.provider.getBlock("latest");
    futureTimestamp = currentBlock.timestamp + 86400;

    const campaignParams = {
      name: "Test Campaign",
      symbol: "TC",
      minRequiredSales: minRequiredSales,
      timestamp: futureTimestamp,
      startPrice: startPrice,
      priceIncrement: priceIncrement,
      paymentToken: await mockPyUsd.getAddress(),
    };

    const tx = await factory.connect(creator).createCampaign(campaignParams);
    const receipt = await tx.wait();

    const event = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === "CampaignCreated"
    );
    const nftAddress = event.args.campaignAddress;

    const NFT = await ethers.getContractFactory("NFT");
    nft = NFT.attach(nftAddress);

    await mockPyUsd.transfer(buyer1.address, ethers.parseUnits("10000", 6));
    await mockPyUsd.transfer(buyer2.address, ethers.parseUnits("10000", 6));
    await mockPyUsd.transfer(creator.address, ethers.parseUnits("10000", 6));

    await networkHelper.snapshot();
  });

  afterEach(async function () {
    await networkHelper.revert();
  });

  describe("Deployment", function () {
    it("should deploy with correct name and symbol", async function () {
      expect(await nft.name()).to.equal("Test Campaign");
      expect(await nft.symbol()).to.equal("TC");
    });

    it("should deploy with correct factory address", async function () {
      expect(await nft.factory()).to.equal(await factory.getAddress());
    });

    it("should deploy with correct creator", async function () {
      expect(await nft.creator()).to.equal(creator.address);
    });

    it("should deploy with correct payment token", async function () {
      expect(await nft.paymentToken()).to.equal(await mockPyUsd.getAddress());
    });

    it("should deploy with correct minRequiredSales", async function () {
      expect(await nft.minRequiredSales()).to.equal(minRequiredSales);
    });

    it("should deploy with correct timestamp", async function () {
      expect(await nft.timestamp()).to.equal(futureTimestamp);
    });

    it("should deploy with correct startPrice", async function () {
      expect(await nft.startPrice()).to.equal(startPrice);
    });

    it("should deploy with correct priceIncrement", async function () {
      expect(await nft.priceIncrement()).to.equal(priceIncrement);
    });

    it("should deploy with zero totalEverMinted", async function () {
      expect(await nft.totalEverMinted()).to.equal(0);
    });

    it("should deploy with zero withdrawalAmount", async function () {
      expect(await nft.withdrawalAmount()).to.equal(0);
    });

    it("should deploy with zero totalEarnedByCreator", async function () {
      expect(await nft.totalEarnedByCreator()).to.equal(0);
    });
  });

  describe("getCurrentPriceToMint", function () {
    it("should return startPrice when no tokens minted", async function () {
      expect(await nft.getCurrentPriceToMint()).to.equal(startPrice);
    });

    it("should calculate correct price after first mint", async function () {
      await mockPyUsd
        .connect(buyer1)
        .approve(await nft.getAddress(), ethers.parseUnits("1000", 6));
      await nft.connect(buyer1).mint();

      const expectedPrice = startPrice + BigInt(priceIncrement) * BigInt(1);
      expect(await nft.getCurrentPriceToMint()).to.equal(expectedPrice);
    });

    it("should calculate correct price after multiple mints", async function () {
      await mockPyUsd
        .connect(buyer1)
        .approve(await nft.getAddress(), ethers.parseUnits("1000", 6));

      await nft.connect(buyer1).mint();
      await nft.connect(buyer1).mint();

      const expectedPrice = startPrice + BigInt(priceIncrement) * BigInt(2);
      expect(await nft.getCurrentPriceToMint()).to.equal(expectedPrice);
    });

    it("should increase price by priceIncrement with each mint", async function () {
      await mockPyUsd
        .connect(buyer1)
        .approve(await nft.getAddress(), ethers.parseUnits("10000", 6));

      const price0 = await nft.getCurrentPriceToMint();
      await nft.connect(buyer1).mint();

      const price1 = await nft.getCurrentPriceToMint();
      await nft.connect(buyer1).mint();

      const price2 = await nft.getCurrentPriceToMint();
      await nft.connect(buyer1).mint();

      const price3 = await nft.getCurrentPriceToMint();

      expect(price1 - price0).to.equal(BigInt(priceIncrement));
      expect(price2 - price1).to.equal(BigInt(priceIncrement));
      expect(price3 - price2).to.equal(BigInt(priceIncrement));
    });
  });

  describe("Mint", function () {
    beforeEach(async function () {
      await mockPyUsd
        .connect(buyer1)
        .approve(await nft.getAddress(), ethers.parseUnits("10000", 6));
    });

    it("should mint successfully with correct payment", async function () {
      const tx = await nft.connect(buyer1).mint();
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Mint"
      );

      expect(event).to.not.be.undefined;
      expect(event.args.holder).to.equal(buyer1.address);
      expect(event.args.tokenId).to.be.a("bigint");
    });

    it("should increase totalEverMinted", async function () {
      expect(await nft.totalEverMinted()).to.equal(0);

      await nft.connect(buyer1).mint();
      expect(await nft.totalEverMinted()).to.equal(1);

      await nft.connect(buyer1).mint();
      expect(await nft.totalEverMinted()).to.equal(2);
    });

    it("should transfer correct net amount to contract (after fee)", async function () {
      const mintPrice = await nft.getCurrentPriceToMint();
      const feeValue = (mintPrice * BigInt(platformFee)) / 100n;
      const netAmount = mintPrice - feeValue;

      const contractBalanceBefore = await mockPyUsd.balanceOf(
        await nft.getAddress()
      );

      await nft.connect(buyer1).mint();

      const contractBalanceAfter = await mockPyUsd.balanceOf(
        await nft.getAddress()
      );

      expect(contractBalanceAfter - contractBalanceBefore).to.equal(netAmount);
    });

    it("should transfer correct fee to treasury", async function () {
      const mintPrice = await nft.getCurrentPriceToMint();
      const feeValue = (mintPrice * BigInt(platformFee)) / 100n;

      const treasuryBalanceBefore = await mockPyUsd.balanceOf(treasury.address);

      await nft.connect(buyer1).mint();

      const treasuryBalanceAfter = await mockPyUsd.balanceOf(treasury.address);

      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(feeValue);
    });

    it("should update withdrawalAmount correctly", async function () {
      const mintPrice = await nft.getCurrentPriceToMint();
      const feeValue = (mintPrice * BigInt(platformFee)) / 100n;
      const netAmount = mintPrice - feeValue;

      expect(await nft.withdrawalAmount()).to.equal(0);

      await nft.connect(buyer1).mint();

      expect(await nft.withdrawalAmount()).to.equal(netAmount);
    });

    it("should accumulate withdrawalAmount with multiple mints", async function () {
      const price1 = await nft.getCurrentPriceToMint();
      const fee1 = (price1 * BigInt(platformFee)) / 100n;
      const net1 = price1 - fee1;

      await nft.connect(buyer1).mint();

      const price2 = await nft.getCurrentPriceToMint();
      const fee2 = (price2 * BigInt(platformFee)) / 100n;
      const net2 = price2 - fee2;

      await nft.connect(buyer1).mint();

      expect(await nft.withdrawalAmount()).to.equal(net1 + net2);
    });

    it("should store holder information correctly", async function () {
      const mintPrice = await nft.getCurrentPriceToMint();
      const feeValue = (mintPrice * BigInt(platformFee)) / 100n;
      const netAmount = mintPrice - feeValue;

      const tx = await nft.connect(buyer1).mint();
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Mint"
      );
      const tokenId = event.args.tokenId;

      const holder = await nft.getHolderByTokenId(tokenId);

      expect(holder.mintPrice).to.equal(netAmount);
      expect(holder.tokenId).to.equal(tokenId);
      expect(holder.paymentToken).to.equal(await mockPyUsd.getAddress());
      expect(holder.mintPriceGross).to.equal(mintPrice);
    });

    it("should mint NFT to msg.sender", async function () {
      const tx = await nft.connect(buyer1).mint();
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Mint"
      );
      const tokenId = event.args.tokenId;

      expect(await nft.ownerOf(tokenId)).to.equal(buyer1.address);
    });

    it("should emit Mint event with correct parameters", async function () {
      await expect(nft.connect(buyer1).mint())
        .to.emit(nft, "Mint")
        .withArgs(buyer1.address, (tokenId) => tokenId > 0);
    });

    it("should increase buyer's NFT balance", async function () {
      expect(await nft.balanceOf(buyer1.address)).to.equal(0);

      await nft.connect(buyer1).mint();
      expect(await nft.balanceOf(buyer1.address)).to.equal(1);

      await nft.connect(buyer1).mint();
      expect(await nft.balanceOf(buyer1.address)).to.equal(2);
    });

    it("should revert if timestamp has passed", async function () {
      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");

      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await mockPyUsd
        .connect(buyer1)
        .approve(await nft.getAddress(), ethers.parseUnits("10000", 6));

      await expect(nft.connect(buyer1).mint()).to.be.revertedWithCustomError(
        nft,
        "MintingIsNotAllowed"
      );
    });

    it("should revert if insufficient allowance", async function () {
      await mockPyUsd.connect(buyer1).approve(await nft.getAddress(), 0);

      await expect(nft.connect(buyer1).mint()).to.be.revertedWithCustomError(
        mockPyUsd,
        "ERC20InsufficientAllowance"
      );
    });

    it("should revert if insufficient balance", async function () {
      const buyer3 = accounts[5];
      await mockPyUsd
        .connect(buyer3)
        .approve(await nft.getAddress(), ethers.parseUnits("10000", 6));

      await expect(nft.connect(buyer3).mint()).to.be.revertedWithCustomError(
        mockPyUsd,
        "ERC20InsufficientBalance"
      );
    });

    it("should allow multiple mints from same user", async function () {
      await nft.connect(buyer1).mint();
      await nft.connect(buyer1).mint();
      await nft.connect(buyer1).mint();

      expect(await nft.balanceOf(buyer1.address)).to.equal(3);
      expect(await nft.totalEverMinted()).to.equal(3);
    });

    it("should allow mints from different users", async function () {
      await mockPyUsd
        .connect(buyer2)
        .approve(await nft.getAddress(), ethers.parseUnits("10000", 6));

      await nft.connect(buyer1).mint();
      await nft.connect(buyer2).mint();

      expect(await nft.balanceOf(buyer1.address)).to.equal(1);
      expect(await nft.balanceOf(buyer2.address)).to.equal(1);
      expect(await nft.totalEverMinted()).to.equal(2);
    });

    it("should deduct correct amount from buyer balance", async function () {
      const mintPrice = await nft.getCurrentPriceToMint();
      const balanceBefore = await mockPyUsd.balanceOf(buyer1.address);

      await nft.connect(buyer1).mint();

      const balanceAfter = await mockPyUsd.balanceOf(buyer1.address);

      expect(balanceBefore - balanceAfter).to.equal(mintPrice);
    });
  });

  describe("Burn", function () {
    let tokenId;

    beforeEach(async function () {
      await mockPyUsd
        .connect(buyer1)
        .approve(await nft.getAddress(), ethers.parseUnits("10000", 6));

      const tx = await nft.connect(buyer1).mint();
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Mint"
      );
      tokenId = event.args.tokenId;
    });

    it("should burn token after timestamp passes", async function () {
      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).burn(tokenId);

      await expect(nft.ownerOf(tokenId)).to.be.revertedWithCustomError(
        nft,
        "ERC721NonexistentToken"
      );
    });

    it("should burn token after minRequiredSales reached", async function () {
      for (let i = 1; i < minRequiredSales; i++) {
        await nft.connect(buyer1).mint();
      }

      expect(await nft.totalEverMinted()).to.be.gte(minRequiredSales);

      await nft.connect(buyer1).burn(tokenId);

      await expect(nft.ownerOf(tokenId)).to.be.revertedWithCustomError(
        nft,
        "ERC721NonexistentToken"
      );
    });

    it("should delete holder information on burn", async function () {
      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).burn(tokenId);

      const holder = await nft.getHolderByTokenId(tokenId);
      expect(holder.mintPrice).to.equal(0);
      expect(holder.tokenId).to.equal(0);
      expect(holder.paymentToken).to.equal(ethers.ZeroAddress);
      expect(holder.mintPriceGross).to.equal(0);
    });

    it("should emit Burn event", async function () {
      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await expect(nft.connect(buyer1).burn(tokenId))
        .to.emit(nft, "Burn")
        .withArgs(buyer1.address, tokenId);
    });

    it("should decrease totalSupply on burn", async function () {
      const supplyBefore = await nft.totalSupply();

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).burn(tokenId);

      const supplyAfter = await nft.totalSupply();
      expect(supplyAfter).to.equal(supplyBefore - 1n);
    });

    it("should decrease owner's balance on burn", async function () {
      const balanceBefore = await nft.balanceOf(buyer1.address);

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).burn(tokenId);

      const balanceAfter = await nft.balanceOf(buyer1.address);
      expect(balanceAfter).to.equal(balanceBefore - 1n);
    });

    it("should revert if caller is not owner", async function () {
      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        nft.connect(buyer2).burn(tokenId)
      ).to.be.revertedWithCustomError(nft, "OwnerIsNotSender");
    });

    it("should revert if conditions not met", async function () {
      await expect(
        nft.connect(buyer1).burn(tokenId)
      ).to.be.revertedWithCustomError(nft, "BurningIsNotAllowed");
    });

    it("should not revert at exact minRequiredSales boundary", async function () {
      for (let i = 1; i < minRequiredSales; i++) {
        await nft.connect(buyer1).mint();
      }

      expect(await nft.totalEverMinted()).to.equal(minRequiredSales);

      await nft.connect(buyer1).burn(tokenId);

      await expect(nft.ownerOf(tokenId)).to.be.revertedWithCustomError(
        nft,
        "ERC721NonexistentToken"
      );
    });

    it("should allow burning at exact timestamp boundary", async function () {
      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).burn(tokenId);

      await expect(nft.ownerOf(tokenId)).to.be.revertedWithCustomError(
        nft,
        "ERC721NonexistentToken"
      );
    });

    it("should not affect totalEverMinted when burning", async function () {
      const totalBefore = await nft.totalEverMinted();

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).burn(tokenId);

      const totalAfter = await nft.totalEverMinted();
      expect(totalAfter).to.equal(totalBefore);
    });

    it("should allow owner to burn multiple tokens", async function () {
      await nft.connect(buyer1).mint();
      await nft.connect(buyer1).mint();

      const token2 = await nft.tokenOfOwnerByIndex(buyer1.address, 1);
      const token3 = await nft.tokenOfOwnerByIndex(buyer1.address, 2);

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).burn(tokenId);
      await nft.connect(buyer1).burn(token2);
      await nft.connect(buyer1).burn(token3);

      expect(await nft.balanceOf(buyer1.address)).to.equal(0);
    });
  });

  describe("ClaimRefund", function () {
    let tokenId;

    beforeEach(async function () {
      await mockPyUsd
        .connect(buyer1)
        .approve(await nft.getAddress(), ethers.parseUnits("10000", 6));

      const tx = await nft.connect(buyer1).mint();
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "Mint"
      );
      tokenId = event.args.tokenId;
    });

    it("should allow refund after timestamp if minSales not reached", async function () {
      expect(await nft.totalEverMinted()).to.be.lt(minRequiredSales);

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      const holder = await nft.getHolderByTokenId(tokenId);
      const balanceBefore = await mockPyUsd.balanceOf(buyer1.address);

      await nft.connect(buyer1).claimRefund(tokenId);

      const balanceAfter = await mockPyUsd.balanceOf(buyer1.address);
      expect(balanceAfter - balanceBefore).to.equal(holder.mintPrice);
    });

    it("should burn token after refund", async function () {
      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).claimRefund(tokenId);

      await expect(nft.ownerOf(tokenId)).to.be.revertedWithCustomError(
        nft,
        "ERC721NonexistentToken"
      );
    });

    it("should emit ClaimRefund event", async function () {
      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await expect(nft.connect(buyer1).claimRefund(tokenId))
        .to.emit(nft, "ClaimRefund")
        .withArgs(buyer1.address, tokenId);
    });

    it("should decrease owner's balance after refund", async function () {
      const balanceBefore = await nft.balanceOf(buyer1.address);

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).claimRefund(tokenId);

      const balanceAfter = await nft.balanceOf(buyer1.address);
      expect(balanceAfter).to.equal(balanceBefore - 1n);
    });

    it("should decrease totalSupply after refund", async function () {
      const supplyBefore = await nft.totalSupply();

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).claimRefund(tokenId);

      const supplyAfter = await nft.totalSupply();
      expect(supplyAfter).to.equal(supplyBefore - 1n);
    });

    it("should refund net amount", async function () {
      const holder = await nft.getHolderByTokenId(tokenId);
      const netAmount = holder.mintPrice;
      const grossAmount = holder.mintPriceGross;

      expect(netAmount).to.be.lt(grossAmount);

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      const balanceBefore = await mockPyUsd.balanceOf(buyer1.address);
      await nft.connect(buyer1).claimRefund(tokenId);
      const balanceAfter = await mockPyUsd.balanceOf(buyer1.address);

      expect(balanceAfter - balanceBefore).to.equal(netAmount);
    });

    it("should revert if caller is not owner", async function () {
      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        nft.connect(buyer2).claimRefund(tokenId)
      ).to.be.revertedWithCustomError(nft, "OwnerIsNotSender");
    });

    it("should revert if minSales reached", async function () {
      for (let i = 1; i < minRequiredSales; i++) {
        await nft.connect(buyer1).mint();
      }

      expect(await nft.totalEverMinted()).to.be.gte(minRequiredSales);

      await expect(
        nft.connect(buyer1).claimRefund(tokenId)
      ).to.be.revertedWithCustomError(nft, "ClaimingRefundIsNotAllowed");
    });

    it("should revert before timestamp if minSales not reached", async function () {
      expect(await nft.totalEverMinted()).to.be.lt(minRequiredSales);

      await expect(
        nft.connect(buyer1).claimRefund(tokenId)
      ).to.be.revertedWithCustomError(nft, "ClaimingRefundIsNotAllowed");
    });

    it("should revert if holder mintPrice is 0", async function () {
      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).claimRefund(tokenId);

      await expect(
        nft.connect(buyer1).claimRefund(tokenId)
      ).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
    });

    it("should allow multiple users to claim refunds", async function () {
      await mockPyUsd
        .connect(buyer2)
        .approve(await nft.getAddress(), ethers.parseUnits("10000", 6));

      const tx2 = await nft.connect(buyer2).mint();
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs.find(
        (log) => log.fragment && log.fragment.name === "Mint"
      );
      const tokenId2 = event2.args.tokenId;

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      const holder1 = await nft.getHolderByTokenId(tokenId);
      const holder2 = await nft.getHolderByTokenId(tokenId2);

      const buyer1BalanceBefore = await mockPyUsd.balanceOf(buyer1.address);
      const buyer2BalanceBefore = await mockPyUsd.balanceOf(buyer2.address);

      await nft.connect(buyer1).claimRefund(tokenId);
      await nft.connect(buyer2).claimRefund(tokenId2);

      const buyer1BalanceAfter = await mockPyUsd.balanceOf(buyer1.address);
      const buyer2BalanceAfter = await mockPyUsd.balanceOf(buyer2.address);

      expect(buyer1BalanceAfter - buyer1BalanceBefore).to.equal(
        holder1.mintPrice
      );
      expect(buyer2BalanceAfter - buyer2BalanceBefore).to.equal(
        holder2.mintPrice
      );
    });

    it("should decrease contract balance after refund", async function () {
      const contractBalanceBefore = await mockPyUsd.balanceOf(
        await nft.getAddress()
      );
      const holder = await nft.getHolderByTokenId(tokenId);

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(buyer1).claimRefund(tokenId);

      const contractBalanceAfter = await mockPyUsd.balanceOf(
        await nft.getAddress()
      );
      expect(contractBalanceBefore - contractBalanceAfter).to.equal(
        holder.mintPrice
      );
    });
  });

  describe("WithdrawCreatorsFunds", function () {
    beforeEach(async function () {
      await mockPyUsd
        .connect(buyer1)
        .approve(await nft.getAddress(), ethers.parseUnits("10000", 6));
      await mockPyUsd
        .connect(buyer2)
        .approve(await nft.getAddress(), ethers.parseUnits("10000", 6));
    });

    it("should allow withdrawal after timestamp passes", async function () {
      await nft.connect(buyer1).mint();
      await nft.connect(buyer1).mint();

      const withdrawalAmountBefore = await nft.withdrawalAmount();
      expect(withdrawalAmountBefore).to.be.gt(0);

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      const creatorBalanceBefore = await mockPyUsd.balanceOf(creator.address);

      await nft.connect(creator).withdrawCreatorsFunds();

      const creatorBalanceAfter = await mockPyUsd.balanceOf(creator.address);
      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(
        withdrawalAmountBefore
      );
    });

    it("should allow withdrawal after minRequiredSales reached", async function () {
      for (let i = 0; i < minRequiredSales; i++) {
        await nft.connect(buyer1).mint();
      }

      expect(await nft.totalEverMinted()).to.be.gte(minRequiredSales);

      const withdrawalAmountBefore = await nft.withdrawalAmount();
      const creatorBalanceBefore = await mockPyUsd.balanceOf(creator.address);

      await nft.connect(creator).withdrawCreatorsFunds();

      const creatorBalanceAfter = await mockPyUsd.balanceOf(creator.address);
      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(
        withdrawalAmountBefore
      );
    });

    it("should reset withdrawalAmount to zero after withdrawal", async function () {
      await nft.connect(buyer1).mint();

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(creator).withdrawCreatorsFunds();

      expect(await nft.withdrawalAmount()).to.equal(0);
    });

    it("should update totalEarnedByCreator correctly", async function () {
      await nft.connect(buyer1).mint();

      const withdrawalAmountBefore = await nft.withdrawalAmount();
      const totalEarnedBefore = await nft.totalEarnedByCreator();

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await nft.connect(creator).withdrawCreatorsFunds();

      const totalEarnedAfter = await nft.totalEarnedByCreator();
      expect(totalEarnedAfter - totalEarnedBefore).to.equal(
        withdrawalAmountBefore
      );
    });

    it("should emit WithdrawCreatorsFunds event", async function () {
      await nft.connect(buyer1).mint();

      const withdrawalAmount = await nft.withdrawalAmount();

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await expect(nft.connect(creator).withdrawCreatorsFunds())
        .to.emit(nft, "WithdrawCreatorsFunds")
        .withArgs(creator.address, withdrawalAmount);
    });

    it("should revert if caller is not creator", async function () {
      await nft.connect(buyer1).mint();

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        nft.connect(buyer1).withdrawCreatorsFunds()
      ).to.be.revertedWithCustomError(nft, "CallerIsNotCreator");
    });

    it("should revert if conditions not met", async function () {
      await nft.connect(buyer1).mint();

      await expect(
        nft.connect(creator).withdrawCreatorsFunds()
      ).to.be.revertedWithCustomError(nft, "WithdrawalNotAllowed");
    });

    it("should allow multiple withdrawals as funds accumulate", async function () {
      for (let i = 0; i < minRequiredSales; i++) {
        await nft.connect(buyer1).mint();
      }

      const firstWithdrawal = await nft.withdrawalAmount();
      await nft.connect(creator).withdrawCreatorsFunds();

      expect(await nft.totalEarnedByCreator()).to.equal(firstWithdrawal);

      await nft.connect(buyer1).mint();
      await nft.connect(buyer1).mint();

      const secondWithdrawal = await nft.withdrawalAmount();
      expect(secondWithdrawal).to.be.gt(0);

      const creatorBalanceBefore = await mockPyUsd.balanceOf(creator.address);
      await nft.connect(creator).withdrawCreatorsFunds();
      const creatorBalanceAfter = await mockPyUsd.balanceOf(creator.address);

      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(
        secondWithdrawal
      );
      expect(await nft.totalEarnedByCreator()).to.equal(
        firstWithdrawal + secondWithdrawal
      );
    });

    it("should decrease contract balance after withdrawal", async function () {
      await nft.connect(buyer1).mint();

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp + 1;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      const withdrawalAmount = await nft.withdrawalAmount();
      const contractBalanceBefore = await mockPyUsd.balanceOf(
        await nft.getAddress()
      );

      await nft.connect(creator).withdrawCreatorsFunds();

      const contractBalanceAfter = await mockPyUsd.balanceOf(
        await nft.getAddress()
      );
      expect(contractBalanceBefore - contractBalanceAfter).to.equal(
        withdrawalAmount
      );
    });

    it("should work at exact timestamp boundary", async function () {
      await nft.connect(buyer1).mint();

      const nftTimestamp = await nft.timestamp();
      const blockBefore = await ethers.provider.getBlock("latest");
      const timeToIncrease = Number(nftTimestamp) - blockBefore.timestamp;

      await ethers.provider.send("evm_increaseTime", [timeToIncrease]);
      await ethers.provider.send("evm_mine", []);

      const withdrawalAmount = await nft.withdrawalAmount();
      const creatorBalanceBefore = await mockPyUsd.balanceOf(creator.address);

      await nft.connect(creator).withdrawCreatorsFunds();

      const creatorBalanceAfter = await mockPyUsd.balanceOf(creator.address);
      expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(
        withdrawalAmount
      );
    });
  });
});

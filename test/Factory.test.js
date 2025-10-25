import { assert, expect } from "chai";
import { network } from "hardhat";
import Network from "./helpers/network.js";

const { ethers } = await network.connect();

describe("Factory", function () {
  let accounts;
  let owner;
  let creator;
  let treasury;
  let factory;
  let mockPyUsd;
  let networkHelper;

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
  });

  beforeEach(async function () {
    const MockPYUSD = await ethers.getContractFactory("MockPYUSD");
    mockPyUsd = await MockPYUSD.deploy("PyUSD", "PYUSD", 6);
    await mockPyUsd.waitForDeployment();

    const Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy(treasury.address, platformFee, baseUri);
    await factory.waitForDeployment();

    await networkHelper.snapshot();
  });

  afterEach(async function () {
    await networkHelper.revert();
  });

  describe("Deployment", function () {
    it("should deploy with correct treasury address", async function () {
      expect(await factory.treasury()).to.equal(treasury.address);
    });

    it("should deploy with correct platform fee", async function () {
      expect(await factory.platformFee()).to.equal(platformFee);
    });

    it("should deploy with correct base URI", async function () {
      expect(await factory.baseUri()).to.equal(baseUri);
    });

    it("should return correct base URI from getBaseUri", async function () {
      expect(await factory.getBaseUri()).to.equal(baseUri);
    });

    it("should return correct platform fee and treasury from getter", async function () {
      const [returnedTreasury, returnedFee] =
        await factory.getPlatformFeeAndTreasury();
      expect(returnedTreasury).to.equal(treasury.address);
      expect(returnedFee).to.equal(platformFee);
    });
  });

  describe("Create Campaign", function () {
    let futureTimestamp;
    let campaignParams;

    beforeEach(async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      futureTimestamp = currentBlock.timestamp + 86400;

      campaignParams = {
        name: "Test Campaign",
        symbol: "TC",
        minRequiredSales: minRequiredSales,
        timestamp: futureTimestamp,
        startPrice: startPrice,
        priceIncrement: priceIncrement,
        paymentToken: await mockPyUsd.getAddress(),
      };
    });

    it("should create a campaign with valid parameters", async function () {
      const tx = await factory.connect(creator).createCampaign(campaignParams);
      const receipt = await tx.wait();
      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "CampaignCreated"
      );

      expect(event).to.not.be.undefined;
      expect(event.args.creator).to.equal(creator.address);
      expect(event.args.campaignAddress).to.be.properAddress;
    });

    it("should emit CampaignCreated event with correct parameters", async function () {
      await expect(factory.connect(creator).createCampaign(campaignParams))
        .to.emit(factory, "CampaignCreated")
        .withArgs(creator.address, (campaignAddress) => {
          return ethers.isAddress(campaignAddress);
        });
    });

    it("should deploy NFT contract with correct parameters", async function () {
      const tx = await factory.connect(creator).createCampaign(campaignParams);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "CampaignCreated"
      );

      const nftAddress = event.args.campaignAddress;
      const NFT = await ethers.getContractFactory("NFT");
      const nft = NFT.attach(nftAddress);

      expect(await nft.name()).to.equal(campaignParams.name);
      expect(await nft.symbol()).to.equal(campaignParams.symbol);
      expect(await nft.factory()).to.equal(await factory.getAddress());
      expect(await nft.minRequiredSales()).to.equal(
        campaignParams.minRequiredSales
      );
      expect(await nft.timestamp()).to.equal(campaignParams.timestamp);
      expect(await nft.startPrice()).to.equal(campaignParams.startPrice);
      expect(await nft.priceIncrement()).to.equal(
        campaignParams.priceIncrement
      );
      expect(await nft.paymentToken()).to.equal(campaignParams.paymentToken);
      expect(await nft.creator()).to.equal(creator.address);
    });

    it("should revert if timestamp is in the past", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const pastTimestamp = currentBlock.timestamp - 3600;

      campaignParams.timestamp = pastTimestamp;

      await expect(
        factory.connect(creator).createCampaign(campaignParams)
      ).to.be.revertedWithCustomError(factory, "TimestampMustBeGreaterThanNow");
    });

    it("should revert if timestamp equals current block timestamp", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      campaignParams.timestamp = currentBlock.timestamp;

      await expect(
        factory.connect(creator).createCampaign(campaignParams)
      ).to.be.revertedWithCustomError(factory, "TimestampMustBeGreaterThanNow");
    });

    it("should allow multiple campaigns from same creator", async function () {
      const tx1 = await factory.connect(creator).createCampaign(campaignParams);
      const receipt1 = await tx1.wait();

      const event1 = receipt1.logs.find(
        (log) => log.fragment && log.fragment.name === "CampaignCreated"
      );
      const campaign1Address = event1.args.campaignAddress;

      campaignParams.name = "Second Campaign";
      campaignParams.symbol = "SC";

      const tx2 = await factory.connect(creator).createCampaign(campaignParams);
      const receipt2 = await tx2.wait();

      const event2 = receipt2.logs.find(
        (log) => log.fragment && log.fragment.name === "CampaignCreated"
      );
      const campaign2Address = event2.args.campaignAddress;

      expect(campaign1Address).to.not.equal(campaign2Address);
    });

    it("should allow different creators to create campaigns", async function () {
      const user1 = accounts[3];
      const user2 = accounts[4];

      const tx1 = await factory.connect(user1).createCampaign(campaignParams);
      const receipt1 = await tx1.wait();

      const event1 = receipt1.logs.find(
        (log) => log.fragment && log.fragment.name === "CampaignCreated"
      );

      expect(event1.args.creator).to.equal(user1.address);

      const tx2 = await factory.connect(user2).createCampaign(campaignParams);
      const receipt2 = await tx2.wait();

      const event2 = receipt2.logs.find(
        (log) => log.fragment && log.fragment.name === "CampaignCreated"
      );

      expect(event2.args.creator).to.equal(user2.address);
    });

    it("should create campaign with zero price increment", async function () {
      campaignParams.priceIncrement = 0;

      const tx = await factory.connect(creator).createCampaign(campaignParams);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "CampaignCreated"
      );

      const nftAddress = event.args.campaignAddress;
      const NFT = await ethers.getContractFactory("NFT");
      const nft = NFT.attach(nftAddress);

      expect(await nft.priceIncrement()).to.equal(0);
    });

    it("should create campaign with min required sales of 0", async function () {
      campaignParams.minRequiredSales = 0;

      const tx = await factory.connect(creator).createCampaign(campaignParams);
      const receipt = await tx.wait();

      const event = receipt.logs.find(
        (log) => log.fragment && log.fragment.name === "CampaignCreated"
      );

      const nftAddress = event.args.campaignAddress;
      const NFT = await ethers.getContractFactory("NFT");
      const nft = NFT.attach(nftAddress);

      expect(await nft.minRequiredSales()).to.equal(0);
    });
  });
});

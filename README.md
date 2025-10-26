# Product Starter

## Overview

Product Starter is a decentralized product launch and discovery platform that enables creators to launch
time-bound NFT campaigns with dynamic pricing. The platform features a factory pattern for
campaign deployment, ERC721 NFT minting with linear price increases, and refund mechanisms for
unsuccessful campaigns. The users will be able to purchase NFTs using PYUSD and the NFTs
will represent various perks of a certain product they receive.

## Architecture

### Tech Stack

- Solidity for smart contracts
- Hardhat 3 as a development framework
- JavaScript for the tests

### Smart Contracts

The system consists of two core contracts:

1. Factory.sol - Campaign factory and platform configuration
2. NFT.sol - Individual campaign ERC721 NFT contract

#### Factory

Deploys and configures individual NFT campaign contracts using such parameters as: name,
symbol, minimum required sales, timestamp, start price, price increment, payment token and
creator address. Maintains platform settings including treasury address, platform fee
percentage, and base URI for metadata.

#### NFT

Individual campaign contract implementing ERC721 NFT standard with dynamic pricing, time-bound
minting, success/failure conditions, and refund mechanisms. The contract implements a linear
pricing model:
currentPrice = startPrice + (priceIncrement × totalEverMinted)
The users can mint the NFTs within a specified timeframe and based on the minting price
formula. Each mint increases the price by the priceIncrement parameter. The campaign is
considered successful when the minRequiredSales is reached. The creator then is able to
withdraw their funds by calling withdrawCreatorsFunds function. If the campaign fails, the
users are able to get their money back by calling claimRefund function. To redeem the
product perks, the users can simply burn their NFT.

## AI Usage

Some test cases were assisted by Claude Code.

# Sample Hardhat 3 Beta Project (`mocha` and `ethers`)

This project showcases a Hardhat 3 Beta project using `mocha` for tests and the `ethers` library for Ethereum interactions.

To learn more about the Hardhat 3 Beta, please visit the [Getting Started guide](https://hardhat.org/docs/getting-started#getting-started-with-hardhat-3). To share your feedback, join our [Hardhat 3 Beta](https://hardhat.org/hardhat3-beta-telegram-group) Telegram group or [open an issue](https://github.com/NomicFoundation/hardhat/issues/new) in our GitHub issue tracker.

## Project Overview

This example project includes:

- A simple Hardhat configuration file.
- Foundry-compatible Solidity unit tests.
- TypeScript integration tests using `mocha` and ethers.js
- Examples demonstrating how to connect to different types of networks, including locally simulating OP mainnet.

## Usage

### Running Tests

To run all the tests in the project, execute the following command:

```shell
npx hardhat test
```

You can also selectively run the Solidity or `mocha` tests:

```shell
npx hardhat test solidity
npx hardhat test mocha
```

### Make a deployment to Sepolia

This project includes an example Ignition module to deploy the contract. You can deploy this module to a locally simulated chain or to Sepolia.

To run the deployment to a local chain:

```shell
npx hardhat ignition deploy ignition/modules/Counter.ts
```

To run the deployment to Sepolia, you need an account with funds to send the transaction. The provided Hardhat configuration includes a Configuration Variable called `SEPOLIA_PRIVATE_KEY`, which you can use to set the private key of the account you want to use.

You can set the `SEPOLIA_PRIVATE_KEY` variable using the `hardhat-keystore` plugin or by setting it as an environment variable.

To set the `SEPOLIA_PRIVATE_KEY` config variable using `hardhat-keystore`:

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

After setting the variable, you can run the deployment with the Sepolia network:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```

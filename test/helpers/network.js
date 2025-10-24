import { network } from "hardhat";

class Network {
  constructor() {
    this.snapshotId = 0;
    this.provider = null;
  }

  async _getProvider() {
    if (!this.provider) {
      const { ethers } = await network.connect();
      this.provider = ethers.provider;
    }
    return this.provider;
  }

  async revert() {
    const provider = await this._getProvider();
    await provider.send("evm_revert", [this.snapshotId]);
    return this.snapshot();
  }

  async snapshot() {
    const provider = await this._getProvider();
    this.snapshotId = await provider.send("evm_snapshot", []);
  }

  async setTime(timestamp) {
    const provider = await this._getProvider();
    await provider.send("evm_mine", [timestamp]);
  }
}

export default Network;

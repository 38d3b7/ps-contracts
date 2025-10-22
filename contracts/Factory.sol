// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Factory {
    address public treasury;

    string public baseUri;

    uint24 public platformFee;

    constructor(
        address treasury_,
        uint24 platformFee_,
        string memory baseUri_
    ) {
        treasury = treasury_;
        platformFee = platformFee_;
        baseUri = baseUri_;
    }

    function getBaseUri() external view returns (string memory) {
        return baseUri;
    }

    function getPlatformFeeAndTreasury()
        external
        view
        returns (address, uint24)
    {
        return (treasury, platformFee);
    }
}

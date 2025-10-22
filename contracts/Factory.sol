// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./NFT.sol";

contract Factory {
    error TimestampMustBeGreaterThanNow();

    event CampaignCreated(
        address indexed creator,
        address indexed campaignAddress
    );

    struct CampaignParams {
        string name;
        string symbol;
        uint32 minRequiredSales;
        uint256 timestamp;
        uint256 startPrice;
        uint256 priceIncrement;
        address paymentToken;
    }

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

    function createCampaign(CampaignParams memory params) external {
        if (params.timestamp < block.timestamp)
            revert TimestampMustBeGreaterThanNow();

        address campaign = address(
            new NFT(
                params.name,
                params.symbol,
                address(this),
                params.minRequiredSales,
                params.timestamp,
                params.startPrice,
                params.priceIncrement,
                params.paymentToken,
                msg.sender
            )
        );

        emit CampaignCreated(msg.sender, campaign);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./Factory.sol";

contract NFT is ERC721Enumerable {
    error MintingIsNotAllowed();
    error OwnerIsNotSender();
    error BurningIsNotAllowed();
    error ClaimingRefundIsNotAllowed();
    error CannotRefundZero();
    error CallerIsNotCreator();
    error WithdrawalNotAllowed();

    event Mint(address indexed holder, uint256 tokenId);
    event Burn(address indexed holder, uint256 tokenId);
    event ClaimRefund(address indexed holder, uint256 tokenId);
    event WithdrawCreatorsFunds(
        address indexed creator,
        uint256 withdrawAmount
    );

    struct Holder {
        uint256 mintPrice;
        uint256 tokenId;
        address paymentToken;
        uint256 mintPriceGross;
    }

    address public factory;
    address public creator;
    address public paymentToken;

    uint32 public minRequiredSales;

    uint256 public timestamp;

    uint256 public startPrice;
    uint256 public priceIncrement;

    uint256 public withdrawalAmount;

    uint256 public totalEarnedByCreator;
    uint256 public totalEverMinted = 0;

    mapping(uint256 => Holder) public holderByTokenId;

    constructor(
        string memory name_,
        string memory symbol_,
        address factory_,
        uint32 minRequiredSales_,
        uint256 timestamp_,
        uint256 startPrice_,
        uint256 priceIncrement_,
        address paymentToken_,
        address creator_
    ) ERC721(name_, symbol_) {
        factory = factory_;
        minRequiredSales = minRequiredSales_;
        timestamp = timestamp_;
        startPrice = startPrice_;
        priceIncrement = priceIncrement_;
        paymentToken = paymentToken_;
        creator = creator_;
    }

    function getCurrentPriceToMint() public view virtual returns (uint256) {
        if (totalEverMinted == 0) {
            return startPrice;
        } else {
            return startPrice + (priceIncrement * totalEverMinted);
        }
    }

    function getHolderByTokenId(
        uint256 tokenId
    ) public view returns (Holder memory) {
        return holderByTokenId[tokenId];
    }

    function mint() public virtual returns (uint256 tokenId) {
        if (block.timestamp >= timestamp) revert MintingIsNotAllowed();

        bytes32 hashed = keccak256(
            abi.encodePacked(creator, block.timestamp, msg.sender)
        );
        tokenId = uint(hashed);

        uint256 mintPrice = getCurrentPriceToMint();
        (address treasury, uint24 feePercentage) = Factory(factory)
            .getPlatformFeeAndTreasury();
        uint256 feeValue = (feePercentage * mintPrice) / 100;
        uint256 mintPriceNet = mintPrice - feeValue;

        IERC20(paymentToken).transferFrom(
            msg.sender,
            address(this),
            mintPriceNet
        );
        IERC20(paymentToken).transferFrom(msg.sender, treasury, feeValue);

        _mint(msg.sender, tokenId);

        totalEverMinted += 1;

        Holder memory holder = Holder(
            mintPriceNet,
            tokenId,
            paymentToken,
            mintPrice
        );

        holderByTokenId[tokenId] = holder;
        withdrawalAmount = withdrawalAmount + mintPriceNet;

        emit Mint(msg.sender, tokenId);
    }

    function burn(uint256 tokenId) public virtual {
        if (ownerOf(tokenId) != msg.sender) revert OwnerIsNotSender();
        if (block.timestamp < timestamp && totalEverMinted < minRequiredSales)
            revert BurningIsNotAllowed();

        _burn(tokenId);

        delete holderByTokenId[tokenId];
        emit Burn(msg.sender, tokenId);
    }

    function claimRefund(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert OwnerIsNotSender();
        if (block.timestamp < timestamp || totalEverMinted >= minRequiredSales)
            revert ClaimingRefundIsNotAllowed();

        Holder memory holder = holderByTokenId[tokenId];

        if (holder.mintPrice == 0) revert CannotRefundZero();
        IERC20(holder.paymentToken).transfer(msg.sender, holder.mintPrice);
        _burn(tokenId);

        emit ClaimRefund(msg.sender, tokenId);
    }

    function withdrawCreatorsFunds() external {
        if (msg.sender != creator) revert CallerIsNotCreator();
        if (block.timestamp < timestamp && totalEverMinted < minRequiredSales)
            revert WithdrawalNotAllowed();

        IERC20(paymentToken).transfer(creator, withdrawalAmount);

        totalEarnedByCreator += withdrawalAmount;

        emit WithdrawCreatorsFunds(msg.sender, withdrawalAmount);

        withdrawalAmount = 0;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return Factory(factory).getBaseUri();
    }
}

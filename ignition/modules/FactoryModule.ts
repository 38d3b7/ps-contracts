import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("FactoryModule", (m) => {
  const factory = m.contract("Factory", [
    "0x40EA0fb3eDb69d4F078b7D81441D411373e63D3F",
    2,
    "ipfs://placeholder/",
  ]);

  return { factory };
});

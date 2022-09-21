import { ethers } from "hardhat";
import { WEB3_NAMEHASH, REVERSE_NAMEHASH, ROOT_NODE, namehash, labelhash } from './sdk/utils'
import { mine } from "@nomicfoundation/hardhat-network-helpers";
const ONE_YEAR = 3600 * 24 * 365;

async function main() {
  const signers = await ethers.getSigners();
  console.log(`The default signer`, signers[0].address);

  // deploy contracts ===========================
  // deploy ENSRegistry  
  const ENSRegistry = await ethers.getContractFactory("ENSRegistry");
  const ensRegistry = await ENSRegistry.deploy();
  await ensRegistry.deployed();
  console.log(`ENSRegistry deployed to ${ensRegistry.address}`);

  // deploy ReverseRegistrar
  const ReverseRegistrar = await ethers.getContractFactory("ReverseRegistrar");
  const reverseRegistrar = await ReverseRegistrar.deploy(ensRegistry.address);
  await reverseRegistrar.deployed();
  console.log(`ReverseRegistrar deployed to ${reverseRegistrar.address}`);

  const BaseRegistrarImplementation = await ethers.getContractFactory("BaseRegistrarImplementation");
  const baseRegistrarImplementation = await BaseRegistrarImplementation.deploy(ensRegistry.address, WEB3_NAMEHASH);
  await baseRegistrarImplementation.deployed();
  console.log(`BaseRegistrarImplementation deployed to ${baseRegistrarImplementation.address}`);

  const StaticMetadataService = await ethers.getContractFactory("StaticMetadataService");
  const staticMetadataService = await StaticMetadataService.deploy('http://a.xyz/{id}.json');
  await staticMetadataService.deployed();
  console.log(`StaticMetadataService deployed to ${staticMetadataService.address}`);

  const NameWrapper = await ethers.getContractFactory("NameWrapper");
  const nameWrapper = await NameWrapper.deploy(ensRegistry.address, baseRegistrarImplementation.address, staticMetadataService.address);
  await nameWrapper.deployed();
  console.log(`NameWrapper deployed to ${nameWrapper.address}`);

  const cfxPrice = BigInt(2000 * 1e8);
  const CFXPriceOracle = await ethers.getContractFactory("CFXPriceOracle");
  const cfxPriceOracle = await CFXPriceOracle.deploy(cfxPrice);
  await cfxPriceOracle.deployed();
  console.log(`CFXPriceOracle deployed to ${cfxPriceOracle.address}`);

  let pricesForOneYear = [100000n, 10000n, 1000n, 100n, 10n, 1n];  // usd
  for(let i = 0; i < pricesForOneYear.length; i++) {
    pricesForOneYear[i] = pricesForOneYear[i] * BigInt(1e18) / (3600n * 24n * 365n);
  }
  const StablePriceOracle = await ethers.getContractFactory("StablePriceOracle");
  const stablePriceOracle = await StablePriceOracle.deploy(cfxPriceOracle.address, pricesForOneYear);
  await stablePriceOracle.deployed();
  console.log(`StablePriceOracle deployed to ${stablePriceOracle.address}`);

  const minCommitmentAge = 120 // s
  const maxCommitmentAge = 3600 * 10; // s
  const ETHRegistrarController = await ethers.getContractFactory("ETHRegistrarController");
  const ethRegistrarController = await ETHRegistrarController.deploy(baseRegistrarImplementation.address, stablePriceOracle.address, minCommitmentAge, maxCommitmentAge, reverseRegistrar.address, nameWrapper.address);
  await ethRegistrarController.deployed();
  console.log(`ETHRegistrarController deployed to ${ethRegistrarController.address}`);

  const PublicResolver = await ethers.getContractFactory("PublicResolver");
  const publicResolver = await PublicResolver.deploy(ensRegistry.address, nameWrapper.address, ethRegistrarController.address, reverseRegistrar.address);
  await publicResolver.deployed();
  console.log(`PublicResolver deployed to ${publicResolver.address}`);

  // setup contracts ===========================
  let tx;
  tx = await ensRegistry.setSubnodeOwner(ROOT_NODE, labelhash('web3'), baseRegistrarImplementation.address)
  await tx.wait();

  tx = await ensRegistry.setSubnodeOwner(ROOT_NODE, labelhash('reverse'), signers[0].address)
  await tx.wait();

  tx = await ensRegistry.setSubnodeOwner(namehash('reverse'), labelhash('addr'), reverseRegistrar.address)
  await tx.wait();

  tx = await baseRegistrarImplementation.addController(ethRegistrarController.address);
  await tx.wait();

  tx = await baseRegistrarImplementation.addController(nameWrapper.address);
  await tx.wait();

  tx = await nameWrapper.setController(ethRegistrarController.address, true);
  await tx.wait();

  tx = await reverseRegistrar.setDefaultResolver(publicResolver.address);
  await tx.wait();

  tx = await reverseRegistrar.setController(ethRegistrarController.address, true);
  await tx.wait();

  // test buy a name ==================================
  const toBuy = 'jiuhua';
  const valid = await ethRegistrarController.valid(toBuy);
  console.log(`valid: ${valid}`);

  const available = await ethRegistrarController.available(toBuy);
  console.log(`available: ${available}`);

  const price = await ethRegistrarController.rentPrice(toBuy, ONE_YEAR);
  console.log(`price: ${price[0]}`);

  const commitment = await ethRegistrarController.makeCommitment(toBuy, signers[0].address, ONE_YEAR, labelhash(toBuy), publicResolver.address, [], true, 0, ONE_YEAR);
  tx = await ethRegistrarController.commit(commitment);
  await tx.wait();

  await mine(1000);
  
  tx = await ethRegistrarController.register(toBuy, signers[0].address, ONE_YEAR, labelhash(toBuy), publicResolver.address, [], true, 0, ONE_YEAR, {
    value: price[0]
  });
  await tx.wait();
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
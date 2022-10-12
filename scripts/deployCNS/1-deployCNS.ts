import hre from 'hardhat';
import { logReceipt } from '../utils';
const {
  conflux,    // The Conflux instance
} = hre;

async function main() {
  // @ts-ignore
  const accounts = await conflux.getSigners();
  const account = accounts[0];
  // @ts-ignore
  const ENSRegistry = await conflux.getContractFactory('ENSRegistry');
  const receipt = await ENSRegistry.constructor().sendTransaction({
    from: account.address,
  }).executed();
  
  logReceipt(receipt, 'ENSRegistry');
}

main().catch(console.log);
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("vote:cast", "Cast a vote")
  .addParam("vote", "Vote value: 'yes' or 'no'")
  .addOptionalParam("address", "Contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;
    
    const voteValue = taskArguments.vote === "yes" || taskArguments.vote === "true";
    
    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("FHEVoter");
    
    console.log(`FHEVoter: ${deployment.address}`);
    
    const [signer] = await ethers.getSigners();
    console.log(`Voter: ${signer.address}`);
    
    const contract = await ethers.getContractAt("FHEVoter", deployment.address);

    const encryptedVote = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .addBool(voteValue)
      .encrypt();

    const tx = await contract.vote(encryptedVote.handles[0], encryptedVote.inputProof);
    console.log(`Transaction: ${tx.hash}`);
    await tx.wait();
    console.log(`Vote cast: ${voteValue ? "YES" : "NO"}`);
  });

task("vote:check", "Check your own vote")
  .addOptionalParam("address", "Contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("FHEVoter");
    
    console.log(`FHEVoter: ${deployment.address}`);
    
    const [signer] = await ethers.getSigners();
    console.log(`Voter: ${signer.address}`);
    
    const contract = await ethers.getContractAt("FHEVoter", deployment.address);

    const encryptedVote = await contract.getMyVote();
    
    const decryptedVote = await fhevm.userDecryptEbool(
      encryptedVote,
      deployment.address,
      signer
    );
    
    console.log(`Your vote: ${decryptedVote ? "YES" : "NO"}`);
  });

task("vote:close", "Close voting and request decryption")
  .addOptionalParam("address", "Contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, network } = hre;

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("FHEVoter");
    
    console.log(`FHEVoter: ${deployment.address}`);
    
    const [owner] = await ethers.getSigners();
    console.log(`Owner: ${owner.address}`);
    
    const contract = await ethers.getContractAt("FHEVoter", deployment.address);

    console.log("Closing voting...");
    let tx = await contract.closeVoting();
    await tx.wait();
    console.log("Voting closed");

    console.log("Requesting decryption...");
    tx = await contract.requestDecryption();
    await tx.wait();

    if (network.name === "localhost" || network.name === "hardhat") {
      const { fhevm } = hre;
      await fhevm.awaitDecryptionOracle();
      const count = await contract.getDecryptedCount();
      console.log(`Result: ${count} YES votes`);
    } else {
      console.log("Decryption requested. Check results with: npx hardhat vote:results --address " + deployment.address + " --network " + network.name);
    }
  });

task("vote:results", "Get decrypted results")
  .addOptionalParam("address", "Contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const deployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("FHEVoter");
    
    console.log(`FHEVoter: ${deployment.address}`);
    
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("FHEVoter", deployment.address);

    const count = await contract.getDecryptedCount();
    console.log(`Result: ${count} YES votes`);
  });

task("vote:address", "Get FHEVoter contract address")
  .setAction(async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;
    const deployment = await deployments.get("FHEVoter");
    console.log(`FHEVoter: ${deployment.address}`);
  });


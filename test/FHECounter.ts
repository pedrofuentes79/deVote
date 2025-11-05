import { FHECounter, FHECounter__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { encryptKeystoreJson } from "ethers";
import { ethers, fhevm } from "hardhat";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("FHECounter")) as FHECounter__factory;
  const fheCounterContract = (await factory.deploy()) as FHECounter;
  const fheCounterContractAddress = await fheCounterContract.getAddress();

  return { fheCounterContract, fheCounterContractAddress };
}

describe("FHECounter", function () {
  let signers: Signers;
  let fheCounterContract: FHECounter;
  let fheCounterContractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async () => {
    ({ fheCounterContract, fheCounterContractAddress } = await deployFixture());
  });

  it("should be deployed", async function () {
    console.log(`FHECounter has been deployed at address ${fheCounterContractAddress}`);
    // Test the deployed address is valid
    expect(ethers.isAddress(fheCounterContractAddress)).to.eq(true);
  });

    it("increment the counter by 1", async function () {
        const encryptedCountBeforeInc = await fheCounterContract.getCount();
        expect(encryptedCountBeforeInc).to.eq(ethers.ZeroHash);
        
        const clearCountBeforeInc = 0;

        const clearOne = 1;

        // creates an encrypted value that is BOUND TO THE CONTRACT AND ALICE'S ADDRESS
        // cannot be reused for any other contractAddr/usrAddr combination
        const encryptedOne = await fhevm
            .createEncryptedInput(fheCounterContractAddress, signers.alice.address)
            .add32(clearOne)
            .encrypt();

        const tx = await fheCounterContract.connect(signers.alice).increment(encryptedOne.handles[0], encryptedOne.inputProof);
        await tx.wait();


        const encryptedCountAfterInc = await fheCounterContract.getCount();
        const clearCountAfterInc = await fhevm.userDecryptEuint(
            FhevmType.euint32,
            encryptedCountAfterInc,
            fheCounterContractAddress,
            signers.alice
        );

        expect(clearCountAfterInc).to.eq(clearCountBeforeInc + clearOne);

    });

    it("decrement the counter by 1", async function () {
      const clearOne = 1;
      const encryptedOne = await fhevm
        .createEncryptedInput(fheCounterContractAddress, signers.alice.address)
        .add32(clearOne)
        .encrypt();
      
        let tx = await fheCounterContract.connect(signers.alice).increment(encryptedOne.handles[0], encryptedOne.inputProof);
        await tx.wait();

        tx = await fheCounterContract.connect(signers.alice).decrement(encryptedOne.handles[0], encryptedOne.inputProof);
        await tx.wait;

        const encryptedCountAfterDec = await fheCounterContract.getCount();
        const clearCountAfterDec = await fhevm.userDecryptEuint(
          FhevmType.euint32,
          encryptedCountAfterDec,
          fheCounterContractAddress,
          signers.alice
        );

        expect(clearCountAfterDec).to.eq(0);
        
    });

});
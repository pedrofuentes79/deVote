import { FHEVoter, FHEVoter__factory } from "../types";
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
  const factory = (await ethers.getContractFactory("FHEVoter")) as FHEVoter__factory;
  const fheVoterContract = (await factory.deploy()) as FHEVoter;
  const fheVoterContractAddress = await fheVoterContract.getAddress();

  return { fheVoterContract, fheVoterContractAddress };
}

describe("FHEVoter", function () {
    let signers: Signers;
    let fheVoterContract: FHEVoter;
    let fheVoterContractAddress: string;

    before(async function () {
        const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
        signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
    });

    beforeEach(async () => {
        ({ fheVoterContract, fheVoterContractAddress } = await deployFixture());
    });

    it("should be deployed", async function () {
        console.log(`FHEVoter has been deployed at address ${fheVoterContractAddress}`);
        expect(ethers.isAddress(fheVoterContractAddress)).to.eq(true);
    });
  

    it("allows to vote with true", async function () {
        const clearVoteValue = true;
        const encryptedVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .addBool(clearVoteValue)
            .encrypt();

        const tx = await fheVoterContract.connect(signers.alice).vote(encryptedVoteValue.handles[0], encryptedVoteValue.inputProof);
        await tx.wait();

        const encryptedCount = await fheVoterContract.getCount();
        const clearCount = await fhevm.userDecryptEuint(
            FhevmType.euint32,
            encryptedCount,
            fheVoterContractAddress,
            signers.alice
        );
        expect(clearCount).to.eq(1);
    });

    it("allows to vote with false", async function () {
        const clearVoteValue = false;
        const encryptedVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .addBool(clearVoteValue)
            .encrypt();

        const tx = await fheVoterContract.connect(signers.alice).vote(encryptedVoteValue.handles[0], encryptedVoteValue.inputProof);
        await tx.wait();

        const encryptedCount = await fheVoterContract.getCount();
        const clearCount = await fhevm.userDecryptEuint(
            FhevmType.euint32,
            encryptedCount,
            fheVoterContractAddress,
            signers.alice
        );
        expect(clearCount).to.eq(0);
    });

    it("does not allow to vote twice", async function () {
        const clearVoteValue = true;
        const encryptedVoteValue = await fhevm
            .createEncryptedInput(fheVoterContractAddress, signers.alice.address)
            .addBool(clearVoteValue)
            .encrypt();
            
            
        const tx = await fheVoterContract.connect(signers.alice).vote(encryptedVoteValue.handles[0], encryptedVoteValue.inputProof);
        await tx.wait();
        await expect(
            fheVoterContract.connect(signers.alice).vote(encryptedVoteValue.handles[0], encryptedVoteValue.inputProof)
        ).to.be.revertedWith("Voter already voted");

        const encryptedCount = await fheVoterContract.getCount();
        const clearCount = await fhevm.userDecryptEuint(
            FhevmType.euint32,
            encryptedCount,
            fheVoterContractAddress,
            signers.alice
        );
        expect(clearCount).to.eq(1);
    });
});
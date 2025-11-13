import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFHEVoter = await deploy("FHEVoter", {
    from: deployer,
    log: true,
  });

  console.log(`FHEVoter contract: `, deployedFHEVoter.address);
};
export default func;
func.id = "deploy_fheVoter"; // id required to prevent reexecution
func.tags = ["FHEVoter"];

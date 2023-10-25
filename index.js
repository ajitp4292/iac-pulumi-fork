'use strict';
const pulumi = require('@pulumi/pulumi');
const aws = require('@pulumi/aws');
const awsx = require('@pulumi/awsx');
const { instanceConfig } = require('./utilsInfra/var');
const amiHelper = require('./utilsInfra/amiHelper');
const {
  createSecurityGroup,
  dataBaseSecurityGroup,
} = require('./utilsInfra/securityGroup');
const { createRDSParameterGroup } = require('./utilsInfra/parmatergrp');
const { createRDSPostgres } = require('./utilsInfra/rdspostgres');
const config = new pulumi.Config();
// {
//   provider: provider;
// }

const {
  createPublicSubnets,
  createPrivateSubnets,
  createPublicRouteTable,
  createPrivateRouteTable,
} = require('./utilsInfra/helper');

// Retrieve configuration values or use defaults if not defined
const vpcName = config.get('vpc_name') || 'my-VPC';
//console.log('Vpc NAME', vpcName);
const vpcCidrBlock = config.get('vpc-cidrBlock') || '10.200.0.0/16';

//console.log('Vpc Cidar block', vpcCidrBlock);
const iGateWayConfig = config.get('InternetGateway') || 'IGW';
//console.log(iGateWayConfig);
const amiId = config.get('amiId');

// Create an AWS VPC
async function createInfrastructure() {
  const myVPC = new aws.ec2.Vpc(vpcName, {
    cidrBlock: vpcCidrBlock,
    enableDnsSupport: true,
    enableDnsHostnames: true,
    instanceTenancy: 'default',
    tags: {
      Name: vpcName,
    },
  });

  const vpcIdValue = myVPC.id;

  const iGateway = new aws.ec2.InternetGateway(iGateWayConfig, {
    vpcId: vpcIdValue,
    tags: {
      Name: iGateWayConfig,
    },
  });

  const iGatewayId = iGateway.id;
  const publicSubnetsArray = await createPublicSubnets(vpcIdValue);
  const privateSubnetsArray = await createPrivateSubnets(vpcIdValue);
  const publicRouteCreatedId = await createPublicRouteTable(
    vpcIdValue,
    iGatewayId
  );
  const privateRouteCreatedId = await createPrivateRouteTable(vpcIdValue);
  //const awsVpc = require('./VPC/awsvpc');

  publicSubnetsArray.forEach((subnet, index) => {
    const association = new aws.ec2.RouteTableAssociation(
      `publicSubnetAssociation${index + 1}`,
      {
        subnetId: subnet.id,
        routeTableId: publicRouteCreatedId,
      }
    );
  });

  privateSubnetsArray.forEach((subnet, index) => {
    const association = new aws.ec2.RouteTableAssociation(
      `privateSubnetAssociation${index + 1}`,
      {
        subnetId: subnet.id,
        routeTableId: privateRouteCreatedId,
      }
    );
  });
  const firstPublicSubnetId = publicSubnetsArray[0].id;

  // const Ami = amiHelper.getMatchingAmi(); // Call the function
  /*
  matchingAmi.apply((ami) => {

    // Access the AMI data here
    console.log(`Found matching AMI ID: ${ami.id}`);
  });*/
  const securityGroup = await createSecurityGroup(vpcIdValue);
  const appSecurityGroupId = securityGroup.id;
  const dbsecurityGroup = await dataBaseSecurityGroup(
    vpcIdValue,
    appSecurityGroupId
  );

  const dbParameterGroup = await createRDSParameterGroup();

  const instance = new aws.ec2.Instance('instance', {
    ami: amiId,
    keyName: instanceConfig.keyName,
    instanceType: instanceConfig.instanceType,
    subnetId: firstPublicSubnetId,
    vpcSecurityGroupIds: [securityGroup.id],
    rootBlockDevice: {
      volumeSize: instanceConfig.rootBlockDevice.volumeSize,
      volumeType: instanceConfig.rootBlockDevice.volumeType,
      deleteOnTermination: instanceConfig.rootBlockDevice.deleteOnTermination,
    },
    disableApiTermination: instanceConfig.disableApiTermination,
    tags: instanceConfig.tags,
  });
}

createInfrastructure();

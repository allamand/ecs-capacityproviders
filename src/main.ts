import { Certificate } from '@aws-cdk/aws-certificatemanager';
import { Vpc } from '@aws-cdk/aws-ec2';
import { Repository } from '@aws-cdk/aws-ecr';
import { Cluster, ContainerImage, PropagatedTagSource } from '@aws-cdk/aws-ecs';
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import { HostedZone } from '@aws-cdk/aws-route53';
import { StringParameter } from '@aws-cdk/aws-ssm';
import { CfnOutput, Duration } from '@aws-cdk/core';
import { App, Construct, Stack, StackProps } from '@aws-cdk/core';

interface MyStackProps extends StackProps {
  vpcTagName?: string; // Specify if you want to reuse existing VPC (or "default" for default VPC), else it will create a new one
  clusterName: string; // Specify if you want to reuse existing ECS cluster, else it will create new one
  createCluster: boolean;
  domainZone: string;
  domainName: string;
  repoName: string;
  tag: string;
}

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: MyStackProps) {
    super(scope, id, props);

    // define resources here...

    const domainZone = HostedZone.fromLookup(this, 'Zone', { domainName: props.domainZone });
    const imageRepo = Repository.fromRepositoryName(this, 'Repo', props.repoName);
    const image = ContainerImage.fromEcrRepository(imageRepo, props.tag);

    //Define VPC
    var vpc = undefined;
    if (props.vpcTagName) {
      if (props.vpcTagName == 'default') {
        vpc = Vpc.fromLookup(this, 'VPC', { isDefault: true });
      } else {
        vpc = Vpc.fromLookup(this, 'VPC', { tags: { Name: props.vpcTagName } });
      }
    } else {
      vpc = new Vpc(this, 'VPC', { maxAzs: 2 });
    }

    //Define ECS Cluster
    // Reference existing network and cluster infrastructure
    var cluster = undefined;

    if (props.createCluster) {
      cluster = Cluster.fromClusterAttributes(this, 'Cluster', {
        clusterName: props.clusterName,
        vpc: vpc,
        securityGroups: [],
      });
    } else {
      cluster = new Cluster(this, 'Cluster', {
        clusterName: props.clusterName,
        vpc,
        containerInsights: true,
      });
    }
    new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });


    //Define TLS Certificate
    // Lookup pre-existing TLS certificate
    const certificateArn = StringParameter.fromStringParameterAttributes(this, 'CertArnParameter', {
      parameterName: 'CertificateArn-' + props.domainZone,
    }).stringValue;
    const certificate = Certificate.fromCertificateArn(this, 'Cert', certificateArn);

    // Create Fargate service + load balancer
    const service = new ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      taskImageOptions: {
        image,
      },
      desiredCount: 1,
      domainName: props.domainName + '.' + props.domainZone,
      domainZone,
      certificate,
      propagateTags: PropagatedTagSource.SERVICE,
    });
    new CfnOutput(this, 'EcsService', { value: service.service.serviceName });

    // SConfigure Load Balancer TargetGroups for peed up deployments
    service.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30');
    service.targetGroup.configureHealthCheck({
      interval: Duration.seconds(5),
      healthyHttpCodes: '200',
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
      timeout: Duration.seconds(4),
    });

  }
}

// for development, use account/region from cdk cli

const domainName = process.env.DOMAIN_NAME ? process.env.DOMAIN_NAME : 'cp1';
const domainZone = process.env.DOMAIN_ZONE ? process.env.DOMAIN_ZONE : 'ecs.demo3.allamand.com';
const vpcTagName = process.env.VPC_TAG_NAME ? process.env.VPC_TAG_NAME : 'ecsworkshop-base/BaseVPC';
const clusterName = process.env.CLUSTER_NAME ? process.env.CLUSTER_NAME : 'ecs-capacityproviders';
const repoName = process.env.ECR_REPOSITORY ? process.env.ECR_REPOSITORY : 'allamand/ecsdemo-capacityproviders';
const tag = process.env.IMAGE_TAG ? process.env.IMAGE_TAG : 'latest';

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new MyStack(app, 'my-stack-dev', {
  domainName: domainName,
  domainZone: domainZone,
  vpcTagName: vpcTagName,
  repoName: repoName,
  tag: tag,
  clusterName: clusterName,
  createCluster: false,
  env: devEnv,
});


// new MyStack(app, 'my-stack-prod', { env: prodEnv });

app.synth();
import * as path from 'path'
import * as core from '@actions/core'
import * as aws from 'aws-sdk'
import * as fs from 'fs'
import { deployStack, getStackOutputs } from './deploy'
import {
  isUrl,
  parseTags,
  parseString,
  parseNumber,
  parseARNs,
  parseParameters
} from './utils'

export type CreateStackInput = aws.CloudFormation.Types.CreateStackInput
export type CreateChangeSetInput = aws.CloudFormation.Types.CreateChangeSetInput
export type InputNoFailOnEmptyChanges = '1' | '0'
export type InputCapabilities =
  | 'CAPABILITY_IAM'
  | 'CAPABILITY_NAMED_IAM'
  | 'CAPABILITY_AUTO_EXPAND'

export type Inputs = {
  [key: string]: string
}

// The custom client configuration for the CloudFormation clients.
const clientConfiguration = {
  customUserAgent: 'aws-cloudformation-github-deploy-for-github-actions'
}

export async function run(): Promise<void> {
  core.debug('TESTING 123')
  try {
    const cfn = new aws.CloudFormation({ ...clientConfiguration })
    const { GITHUB_WORKSPACE = __dirname } = process.env

    // Get inputs
    const template = core.getInput('template', { required: true })
    const stackName = core.getInput('name', { required: true })
    const capabilities = core.getInput('capabilities', {
      required: false
    })
    const parameterOverrides = core.getInput('parameter-overrides', {
      required: false
    })
    const noEmptyChangeSet = !!+core.getInput('no-fail-on-empty-changeset', {
      required: false
    })
    const noExecuteChageSet = !!+core.getInput('no-execute-changeset', {
      required: false
    })
    const noDeleteFailedChangeSet = !!+core.getInput(
      'no-delete-failed-changeset',
      {
        required: false
      }
    )
    const disableRollback = !!+core.getInput('disable-rollback', {
      required: false
    })
    const timeoutInMinutes = parseNumber(
      core.getInput('timeout-in-minutes', {
        required: false
      })
    )
    const notificationARNs = parseARNs(
      core.getInput('notification-arns', {
        required: false
      })
    )
    const roleARN = parseString(
      core.getInput('role-arn', {
        required: false
      })
    )
    const tags = parseTags(
      core.getInput('tags', {
        required: false
      })
    )
    const terminationProtections = !!+core.getInput('termination-protection', {
      required: false
    })

    const policy = core.getInput('policy', { required: false })

    // Setup CloudFormation Stack
    let templateBody
    let templateUrl

    if (isUrl(template)) {
      core.debug('Using CloudFormation Stack from Amazon S3 Bucket')
      templateUrl = template
    } else {
      core.debug('Loading CloudFormation Stack template')
      const templateFilePath = path.isAbsolute(template)
        ? template
        : path.join(GITHUB_WORKSPACE, template)
      templateBody = fs.readFileSync(templateFilePath, 'utf8')
    }

    // Setup CloudFormation Stack
    let policyBody
    let policyUrl

    if (policy) {
      if (isUrl(policy)) {
        core.debug('Using CloudFormation Stack Policy from Amazon S3 Bucket')
        policyUrl = policy
      } else {
        core.debug('Loading CloudFormation Stack Policy')
        const policyFilePath = path.isAbsolute(policy)
          ? policy
          : path.join(GITHUB_WORKSPACE, policy)
        policyBody = fs.readFileSync(policyFilePath, 'utf8')
      }
    }

    // CloudFormation Stack Parameter for the creation or update
    const params: CreateStackInput = {
      StackName: stackName,
      Capabilities: [...capabilities.split(',').map(cap => cap.trim())],
      RoleARN: roleARN,
      NotificationARNs: notificationARNs,
      DisableRollback: disableRollback,
      TimeoutInMinutes: timeoutInMinutes,
      TemplateBody: templateBody,
      TemplateURL: templateUrl,
      Tags: tags,
      EnableTerminationProtection: terminationProtections,
      StackPolicyBody: policyBody,
      StackPolicyURL: policyUrl
    }

    if (parameterOverrides) {
      params.Parameters = parseParameters(parameterOverrides.trim())
    }

    const stackId = await deployStack(
      cfn,
      params,
      noEmptyChangeSet,
      noExecuteChageSet,
      noDeleteFailedChangeSet
    )
    core.setOutput('stack-id', stackId || 'UNKNOWN')

    if (stackId) {
      const outputs = await getStackOutputs(cfn, stackId)
      for (const [key, value] of outputs) {
        core.setOutput(key, value)
      }
    }
  } catch (err) {
    core.setFailed(err.message)
    core.debug(err.stack)
  }
}

/* istanbul ignore next */
if (require.main === module) {
  run()
}

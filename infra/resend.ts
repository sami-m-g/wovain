// Resend's sending domain, through Resend's REST API (resend.com/docs/api-
// reference/domains): no maintained Pulumi or Terraform provider exists, so
// this is a small dynamic provider. Creating the domain returns the DNS
// records Resend wants, which domains.ts writes into the zone; Verify then
// asks Resend to check them. The API key comes from the `resend-api-key`
// stack secret, the only manual step (account signup).
import * as pulumi from "@pulumi/pulumi";

export interface ResendRecord {
  // Relative to the domain, e.g. "send" or "resend._domainkey".
  name: string;
  type: string;
  value: string;
  priority?: number;
}

interface DomainInputs {
  apiKey: string;
  name: string;
  region: string;
}

interface DomainOutputs extends DomainInputs {
  records: ResendRecord[];
}

const domainProvider: pulumi.dynamic.ResourceProvider<
  DomainInputs,
  DomainOutputs
> = {
  async create(inputs) {
    const response = await fetch("https://api.resend.com/domains", {
      body: JSON.stringify({ name: inputs.name, region: inputs.region }),
      headers: {
        authorization: `Bearer ${inputs.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(
        `Resend refused the domain: ${response.status} ${await response.text()}`
      );
    }
    const domain = (await response.json()) as {
      id: string;
      records: ResendRecord[];
    };
    return {
      id: domain.id,
      outs: {
        ...inputs,
        records: domain.records.map(({ name, priority, type, value }) => ({
          name,
          type,
          value,
          ...(priority === undefined ? {} : { priority }),
        })),
      },
    };
  },
  async delete(id, props) {
    const response = await fetch(`https://api.resend.com/domains/${id}`, {
      headers: { authorization: `Bearer ${props.apiKey}` },
      method: "DELETE",
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Resend kept the domain: ${response.status}`);
    }
  },
  // A new name or region is a new Resend domain; a rotated key is not.
  diff(_id, olds, news) {
    const replaces = (["name", "region"] as const).filter(
      (key) => olds[key] !== news[key]
    );
    return Promise.resolve({
      changes: replaces.length > 0 || olds.apiKey !== news.apiKey,
      replaces,
    });
  },
  update(_id, olds, news) {
    return Promise.resolve({ outs: { ...olds, apiKey: news.apiKey } });
  },
};

export class ResendDomain extends pulumi.dynamic.Resource {
  declare readonly records: pulumi.Output<ResendRecord[]>;

  constructor(
    name: string,
    args: {
      apiKey: pulumi.Input<string>;
      name: pulumi.Input<string>;
      region: pulumi.Input<string>;
    },
    opts?: pulumi.CustomResourceOptions
  ) {
    super(
      domainProvider,
      name,
      { ...args, records: undefined },
      { ...opts, additionalSecretOutputs: ["apiKey"] },
      // Its own type, so it and its verification can share a name.
      "resend",
      "Domain"
    );
  }
}

interface VerifyInputs {
  apiKey: string;
  domainId: string;
}

// Asks Resend to check the records once they exist; Resend keeps checking
// on its own for 72 hours after that.
const verifyProvider: pulumi.dynamic.ResourceProvider<
  VerifyInputs,
  VerifyInputs
> = {
  async create(inputs) {
    const response = await fetch(
      `https://api.resend.com/domains/${inputs.domainId}/verify`,
      {
        headers: { authorization: `Bearer ${inputs.apiKey}` },
        method: "POST",
      }
    );
    if (!response.ok) {
      throw new Error(`Resend didn't start verification: ${response.status}`);
    }
    return { id: inputs.domainId, outs: inputs };
  },
};

export class ResendVerification extends pulumi.dynamic.Resource {
  constructor(
    name: string,
    args: { apiKey: pulumi.Input<string>; domainId: pulumi.Input<string> },
    opts?: pulumi.CustomResourceOptions
  ) {
    super(
      verifyProvider,
      name,
      args,
      { ...opts, additionalSecretOutputs: ["apiKey"] },
      "resend",
      "Verification"
    );
  }
}

"use client";

import React from "react";
import { inputClass } from "../../constants";
import type { MonitorFormData } from "../../types";

type GraphqlFormData = MonitorFormData & {
  graphqlQuery?: string | null;
  graphqlVariables?: string | null;
  graphqlDataPath?: string | null;
  graphqlExpectedValue?: string | null;
};

interface GraphqlConfigSectionProps {
  formData: GraphqlFormData;
  onSetFormData: (data: GraphqlFormData) => void;
}

export function GraphqlConfigSection({ formData, onSetFormData }: GraphqlConfigSectionProps) {
  return (
    <>
      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          <span className="font-medium text-text-primary">GraphQL Monitor</span> — sends a POST request to your GraphQL endpoint with the configured query. Checks for HTTP errors, GraphQL errors in the response, and optionally validates a specific field value. Default query:{" "}
          <code className="bg-surface-2 px-1 rounded">{"{ __typename }"}</code> (introspection health check).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">GraphQL Query</label>
        <textarea
          rows={4}
          value={formData.graphqlQuery ?? ""}
          onChange={(e) => onSetFormData({ ...formData, graphqlQuery: e.target.value || null })}
          className={`${inputClass} font-mono text-xs`}
          placeholder={"{ __typename }"}
        />
        <p className="text-xs text-text-secondary mt-1">Leave empty to use the default introspection health check.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Variables (JSON)</label>
        <textarea
          rows={2}
          value={formData.graphqlVariables ?? ""}
          onChange={(e) => onSetFormData({ ...formData, graphqlVariables: e.target.value || null })}
          className={`${inputClass} font-mono text-xs`}
          placeholder='{ "id": "123" }'
        />
        <p className="text-xs text-text-secondary mt-1">Optional JSON variables to pass with the query.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Expected Field (JSONPath)</label>
        <input
          type="text"
          value={formData.graphqlDataPath ?? ""}
          onChange={(e) => onSetFormData({ ...formData, graphqlDataPath: e.target.value || null })}
          className={inputClass}
          placeholder="$.data.__typename"
        />
        <p className="text-xs text-text-secondary mt-1">
          Optional JSONPath to a field that must exist in the response (e.g.{" "}
          <code className="bg-surface-2 px-1 rounded">$.data.status.health</code>).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">Expected Value</label>
        <input
          type="text"
          value={formData.graphqlExpectedValue ?? ""}
          onChange={(e) => onSetFormData({ ...formData, graphqlExpectedValue: e.target.value || null })}
          className={inputClass}
          placeholder="ok"
        />
        <p className="text-xs text-text-secondary mt-1">Optional: if set, the value at the field path must exactly match this string. Leave empty to just assert the field exists.</p>
      </div>
    </>
  );
}

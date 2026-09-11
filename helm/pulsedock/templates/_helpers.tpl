{{/*
Expand the name of the chart.
*/}}
{{- define "pulsedock.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "pulsedock.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "pulsedock.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "pulsedock.labels" -}}
helm.sh/chart: {{ include "pulsedock.chart" . }}
{{ include "pulsedock.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels — used in matchLabels and pod template labels.
*/}}
{{- define "pulsedock.selectorLabels" -}}
app.kubernetes.io/name: {{ include "pulsedock.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Service account name.
*/}}
{{- define "pulsedock.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "pulsedock.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Compute the namespace: use namespaceOverride if set, otherwise release namespace.
*/}}
{{- define "pulsedock.namespace" -}}
{{- if .Values.namespaceOverride }}
{{- .Values.namespaceOverride }}
{{- else }}
{{- .Release.Namespace }}
{{- end }}
{{- end }}

{{/*
Compute the DATABASE_URL.
  - If secrets.databaseUrl is set, use it verbatim.
  - Else if postgres.enabled, auto-generate from postgres values.
  - Else empty string (user must supply an external URL).
*/}}
{{- define "pulsedock.databaseUrl" -}}
{{- if .Values.secrets.databaseUrl }}
{{- .Values.secrets.databaseUrl }}
{{- else if .Values.postgres.enabled }}
{{- printf "postgresql://%s:%s@%s-postgres:5432/%s?schema=public" .Values.postgres.username .Values.postgres.password (include "pulsedock.fullname" .) .Values.postgres.database }}
{{- end }}
{{- end }}

{{/*
Compute the REDIS_URL.
  - If secrets.redisUrl is set, use it verbatim.
  - Else if redis.enabled, auto-generate.
  - Else empty string.
*/}}
{{- define "pulsedock.redisUrl" -}}
{{- if .Values.secrets.redisUrl }}
{{- .Values.secrets.redisUrl }}
{{- else if .Values.redis.enabled }}
{{- printf "redis://%s-redis:6379" (include "pulsedock.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Compute the API_URL value for the ConfigMap.
  - If config.apiUrl is set, use it.
  - Else if ingress.enabled, derive https://<host>/api.
  - Else leave empty (user can set via extraEnv).
*/}}
{{- define "pulsedock.apiUrl" -}}
{{- if .Values.config.apiUrl }}
{{- .Values.config.apiUrl }}
{{- else if .Values.ingress.enabled }}
{{- $scheme := ternary "https" "http" .Values.ingress.tls -}}
{{- printf "%s://%s" $scheme .Values.ingress.host }}
{{- end }}
{{- end }}

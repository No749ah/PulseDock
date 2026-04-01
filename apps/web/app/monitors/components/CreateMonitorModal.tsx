"use client";

import { MonitorFormModal } from "./MonitorFormModal";
import type { TagItem, MonitorPlugin, MonitorFormDataExtended } from "../types";

interface Props {
  isOpen: boolean;
  showTemplates: boolean;
  formData: MonitorFormDataExtended;
  formErrors: Record<string, string>;
  formTouched: Record<string, boolean>;
  tagInput: string;
  selectedTags: string[];
  allTags: TagItem[];
  folders: { id: string; name: string }[];
  availablePlugins: MonitorPlugin[];
  selectedPlugin: MonitorPlugin | null;
  onClose: () => void;
  onSubmit: () => void;
  onSetShowTemplates: (value: boolean) => void;
  onSetFormData: (value: MonitorFormDataExtended) => void;
  onSetFormErrors: (value: Record<string, string>) => void;
  onSetFormTouched: (value: Record<string, boolean>) => void;
  onSetTagInput: (value: string) => void;
  onSetSelectedTags: (value: string[]) => void;
  onApplyTemplate: (template: import("../../components/MonitorTemplates").MonitorTemplate) => void;
  onCopySuccess: (message: string) => void;
}

export function CreateMonitorModal(props: Props) {
  return (
    <MonitorFormModal
      isOpen={props.isOpen}
      mode="create"
      showTemplates={props.showTemplates}
      formData={props.formData}
      formErrors={props.formErrors}
      formTouched={props.formTouched}
      tagInput={props.tagInput}
      selectedTags={props.selectedTags}
      allTags={props.allTags}
      folders={props.folders}
      availablePlugins={props.availablePlugins}
      selectedPlugin={props.selectedPlugin}
      onClose={props.onClose}
      onCancel={props.onClose}
      onSubmit={props.onSubmit}
      onSetShowTemplates={props.onSetShowTemplates}
      onSetFormData={props.onSetFormData}
      onSetFormErrors={props.onSetFormErrors}
      onSetFormTouched={props.onSetFormTouched}
      onSetTagInput={props.onSetTagInput}
      onSetSelectedTags={props.onSetSelectedTags}
      onApplyTemplate={props.onApplyTemplate}
      onCopySuccess={props.onCopySuccess}
    />
  );
}

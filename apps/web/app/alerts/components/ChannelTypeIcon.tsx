import { Bell, Mail, MessageSquare, Hash, Globe, Send, Smartphone } from 'lucide-react';
import type { AlertType } from './types';

export function ChannelTypeIcon({ type }: { type: AlertType }) {
  const iconClass = 'w-4 h-4 shrink-0';
  switch (type) {
    case 'email':
      return <Mail className={`${iconClass} text-blue-400`} />;
    case 'slack':
      return <MessageSquare className={`${iconClass} text-green-400`} />;
    case 'discord':
      return <Hash className={`${iconClass} text-indigo-400`} />;
    case 'webhook':
      return <Globe className={`${iconClass} text-orange-400`} />;
    case 'telegram':
      return <Send className={`${iconClass} text-sky-400`} />;
    case 'pagerduty':
      return <Bell className={`${iconClass} text-green-500`} />;
    case 'opsgenie':
      return <Bell className={`${iconClass} text-orange-500`} />;
    case 'sms':
      return <Smartphone className={`${iconClass} text-green-400`} />;
    case 'teams':
      return <MessageSquare className={`${iconClass} text-purple-400`} />;
    case 'ntfy':
      return <Bell className={`${iconClass} text-yellow-400`} />;
    case 'gotify':
      return <Bell className={`${iconClass} text-cyan-400`} />;
    case 'matrix':
      return <MessageSquare className={`${iconClass} text-emerald-400`} />;
    case 'rocketchat':
      return <MessageSquare className={`${iconClass} text-orange-400`} />;
    case 'apprise':
      return <Bell className={`${iconClass} text-violet-400`} />;
    case 'mattermost':
      return <MessageSquare className={`${iconClass} text-blue-400`} />;
    case 'zulip':
      return <MessageSquare className={`${iconClass} text-green-400`} />;
    default:
      return <Bell className={`${iconClass} text-text-secondary`} />;
  }
}

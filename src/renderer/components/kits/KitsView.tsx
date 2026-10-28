import React from 'react';

import { CommunityKind } from '../../../shared/community/constants';
import { i18nService } from '../../services/i18n';
import CommunityPublishButton from '../CommunityPublishButton';
import ComposeIcon from '../icons/ComposeIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import KitsManager from './KitsManager';

interface KitsViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
  onTryAsking?: (text: string, kitId: string) => void;
  onUseKit?: (kitId: string) => void;
}

const KitsView: React.FC<KitsViewProps> = ({ isSidebarCollapsed, onToggleSidebar, onNewChat, updateBadge, onTryAsking, onUseKit }) => {
  const isMac = window.electron.platform === 'darwin';
  const isWindows = window.electron.platform === 'win32';
  return (
    <div
      data-skin-management-page="true"
      className="relative z-10 flex-1 flex flex-col bg-background h-full"
    >
      <div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center space-x-3 h-8">
          {isSidebarCollapsed && !isWindows && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                <ComposeIcon className="h-4 w-4" />
              </button>
              {updateBadge}
            </div>
          )}
          <h1 className="text-lg font-semibold text-foreground">
            {i18nService.t('kits')}
          </h1>
        </div>
        <CommunityPublishButton kind={CommunityKind.Expert} />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[1120px] px-6 py-6">
          <KitsManager onTryAsking={onTryAsking} onUseKit={onUseKit} />
        </div>
      </div>
    </div>
  );
};

export default KitsView;

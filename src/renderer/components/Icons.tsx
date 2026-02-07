/**
 * Icons - Centralized icon system for AgentPrime
 * 
 * Using Lucide React for consistent, beautiful icons throughout the app.
 * This replaces the emoji-based icons for a more professional look.
 */

import React from 'react';
import {
  // File operations
  Folder,
  FolderOpen,
  File,
  FileCode,
  FilePlus,
  FolderPlus,
  Save,
  Download,
  Upload,
  RefreshCw,
  
  // Navigation & UI
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  X,
  Plus,
  Minus,
  Check,
  Search,
  Settings,
  Menu,
  MoreHorizontal,
  MoreVertical,
  
  // Actions
  Play,
  Square,
  Trash2,
  Copy,
  Clipboard,
  Edit,
  Eye,
  EyeOff,
  
  // Git
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  
  // AI & Brain
  Bot,
  Brain,
  Sparkles,
  Zap,
  MessageSquare,
  Send,
  
  // Code & Editor
  Code,
  Terminal,
  Braces,
  Hash,
  
  // Layout
  PanelLeft,
  PanelRight,
  Columns,
  Maximize2,
  Minimize2,
  SplitSquareHorizontal,
  
  // Status
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  Circle,
  Target,
  Bug,
  
  // Misc
  Sun,
  Moon,
  Keyboard,
  HelpCircle,
  ExternalLink,
  Clock,
  Star,
  Heart,
  
  // File types
  FileJson,
  FileText,
  Image,
  
  // Additional
  Home,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  RotateCw,
  Undo,
  Redo,
  Layout,
  Palette,
  type LucideIcon
} from 'lucide-react';

// Icon size presets
export const iconSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32
} as const;

type IconSize = keyof typeof iconSizes | number;

interface IconProps {
  size?: IconSize;
  className?: string;
  color?: string;
  strokeWidth?: number;
}

// Helper to get size value
const getSize = (size: IconSize): number => {
  if (typeof size === 'number') return size;
  return iconSizes[size];
};

// Create icon component wrapper
const createIcon = (IconComponent: LucideIcon) => {
  return ({ size = 'md', className = '', color, strokeWidth = 2 }: IconProps) => (
    <IconComponent 
      size={getSize(size)} 
      className={`icon ${className}`}
      color={color}
      strokeWidth={strokeWidth}
    />
  );
};

// File & Folder Icons
export const IconFolder = createIcon(Folder);
export const IconFolderOpen = createIcon(FolderOpen);
export const IconFile = createIcon(File);
export const IconFileCode = createIcon(FileCode);
export const IconFilePlus = createIcon(FilePlus);
export const IconFolderPlus = createIcon(FolderPlus);
export const IconSave = createIcon(Save);
export const IconDownload = createIcon(Download);
export const IconUpload = createIcon(Upload);
export const IconRefresh = createIcon(RefreshCw);

// Navigation Icons
export const IconChevronRight = createIcon(ChevronRight);
export const IconChevronDown = createIcon(ChevronDown);
export const IconChevronLeft = createIcon(ChevronLeft);
export const IconChevronUp = createIcon(ChevronUp);
export const IconClose = createIcon(X);
export const IconX = createIcon(X); // Alias for IconClose
export const IconPlus = createIcon(Plus);
export const IconMinus = createIcon(Minus);
export const IconCheck = createIcon(Check);
export const IconSearch = createIcon(Search);
export const IconSettings = createIcon(Settings);
export const IconMenu = createIcon(Menu);
export const IconMoreHorizontal = createIcon(MoreHorizontal);
export const IconMoreVertical = createIcon(MoreVertical);

// Action Icons
export const IconPlay = createIcon(Play);
export const IconStop = createIcon(Square);
export const IconTrash = createIcon(Trash2);
export const IconCopy = createIcon(Copy);
export const IconClipboard = createIcon(Clipboard);
export const IconEdit = createIcon(Edit);
export const IconEye = createIcon(Eye);
export const IconEyeOff = createIcon(EyeOff);

// Git Icons
export const IconGitBranch = createIcon(GitBranch);
export const IconGitCommit = createIcon(GitCommit);
export const IconGitMerge = createIcon(GitMerge);
export const IconGitPullRequest = createIcon(GitPullRequest);

// AI Icons
export const IconBot = createIcon(Bot);
export const IconBrain = createIcon(Brain);
export const IconSparkles = createIcon(Sparkles);
export const IconZap = createIcon(Zap);
export const IconMessage = createIcon(MessageSquare);
export const IconSend = createIcon(Send);

// Code Icons
export const IconCode = createIcon(Code);
export const IconTerminal = createIcon(Terminal);
export const IconBraces = createIcon(Braces);
export const IconHash = createIcon(Hash);

// Layout Icons
export const IconPanelLeft = createIcon(PanelLeft);
export const IconPanelRight = createIcon(PanelRight);
export const IconColumns = createIcon(Columns);
export const IconMaximize = createIcon(Maximize2);
export const IconMinimize = createIcon(Minimize2);
export const IconSplit = createIcon(SplitSquareHorizontal);

// Status Icons
export const IconError = createIcon(AlertCircle);
export const IconWarning = createIcon(AlertTriangle);
export const IconSuccess = createIcon(CheckCircle);
export const IconInfo = createIcon(Info);
export const IconLoading = createIcon(Loader2);
export const IconCircle = createIcon(Circle);
export const IconTarget = createIcon(Target);
export const IconBug = createIcon(Bug);

// Theme Icons
export const IconSun = createIcon(Sun);
export const IconMoon = createIcon(Moon);

// Misc Icons
export const IconKeyboard = createIcon(Keyboard);
export const IconHelp = createIcon(HelpCircle);
export const IconExternalLink = createIcon(ExternalLink);
export const IconClock = createIcon(Clock);
export const IconStar = createIcon(Star);
export const IconHeart = createIcon(Heart);
export const IconHome = createIcon(Home);
export const IconArrowLeft = createIcon(ArrowLeft);
export const IconArrowRight = createIcon(ArrowRight);
export const IconUndo = createIcon(Undo);
export const IconRedo = createIcon(Redo);
export const IconLayout = createIcon(Layout);
export const IconPalette = createIcon(Palette);

// File type specific icons
export const IconFileJson = createIcon(FileJson);
export const IconFileText = createIcon(FileText);
export const IconImage = createIcon(Image);

// File type icon mapper
export const getFileIcon = (filename: string, isDir: boolean): React.ReactNode => {
  if (isDir) {
    return <IconFolder size="sm" />;
  }
  
  const ext = filename.split('.').pop()?.toLowerCase();
  
  const iconMap: Record<string, React.ReactNode> = {
    // JavaScript/TypeScript
    js: <IconFileCode size="sm" className="icon-js" />,
    jsx: <IconFileCode size="sm" className="icon-jsx" />,
    ts: <IconFileCode size="sm" className="icon-ts" />,
    tsx: <IconFileCode size="sm" className="icon-tsx" />,
    
    // Web
    html: <IconCode size="sm" className="icon-html" />,
    css: <IconPalette size="sm" className="icon-css" />,
    scss: <IconPalette size="sm" className="icon-scss" />,
    
    // Data
    json: <IconFileJson size="sm" className="icon-json" />,
    yaml: <IconFileText size="sm" className="icon-yaml" />,
    yml: <IconFileText size="sm" className="icon-yaml" />,
    
    // Docs
    md: <IconFileText size="sm" className="icon-md" />,
    txt: <IconFileText size="sm" className="icon-txt" />,
    
    // Python
    py: <IconFileCode size="sm" className="icon-py" />,
    
    // Rust
    rs: <IconFileCode size="sm" className="icon-rs" />,
    
    // Go
    go: <IconFileCode size="sm" className="icon-go" />,
    
    // Config
    toml: <IconSettings size="sm" className="icon-toml" />,
    
    // Shell
    sh: <IconTerminal size="sm" className="icon-sh" />,
    bash: <IconTerminal size="sm" className="icon-bash" />,
    bat: <IconTerminal size="sm" className="icon-bat" />,
    ps1: <IconTerminal size="sm" className="icon-ps1" />,
    
    // Images
    png: <IconImage size="sm" className="icon-image" />,
    jpg: <IconImage size="sm" className="icon-image" />,
    jpeg: <IconImage size="sm" className="icon-image" />,
    gif: <IconImage size="sm" className="icon-image" />,
    svg: <IconImage size="sm" className="icon-image" />,
    ico: <IconImage size="sm" className="icon-image" />
  };
  
  return iconMap[ext || ''] || <IconFile size="sm" />;
};

// Spinning loader
export const IconSpinner: React.FC<IconProps> = (props) => (
  <IconLoading {...props} className={`${props.className || ''} icon-spin`} />
);

// Export all raw Lucide icons for advanced usage
export {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FilePlus,
  FolderPlus,
  Save,
  Download,
  Upload,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  X,
  Plus,
  Minus,
  Check,
  Search,
  Settings,
  Menu,
  MoreHorizontal,
  MoreVertical,
  Play,
  Square,
  Trash2,
  Copy,
  Clipboard,
  Edit,
  Eye,
  EyeOff,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Bot,
  Brain,
  Sparkles,
  Zap,
  MessageSquare,
  Send,
  Code,
  Terminal,
  Braces,
  Hash,
  PanelLeft,
  PanelRight,
  Columns,
  Maximize2,
  Minimize2,
  SplitSquareHorizontal,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  Circle,
  Target,
  Bug,
  Sun,
  Moon,
  Keyboard,
  HelpCircle,
  ExternalLink,
  Clock,
  Star,
  Heart,
  FileJson,
  FileText,
  Image,
  Home,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  RotateCw,
  Undo,
  Redo,
  Layout,
  Palette
};

export default {
  IconFolder,
  IconFolderOpen,
  IconFile,
  IconFileCode,
  IconFilePlus,
  IconFolderPlus,
  IconSave,
  IconDownload,
  IconUpload,
  IconRefresh,
  IconChevronRight,
  IconChevronDown,
  IconChevronLeft,
  IconClose,
  IconPlus,
  IconMinus,
  IconCheck,
  IconSearch,
  IconSettings,
  IconMenu,
  IconMoreHorizontal,
  IconMoreVertical,
  IconPlay,
  IconStop,
  IconTrash,
  IconCopy,
  IconClipboard,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconGitBranch,
  IconGitCommit,
  IconGitMerge,
  IconGitPullRequest,
  IconBot,
  IconBrain,
  IconSparkles,
  IconZap,
  IconMessage,
  IconSend,
  IconCode,
  IconTerminal,
  IconBraces,
  IconHash,
  IconPanelLeft,
  IconPanelRight,
  IconColumns,
  IconMaximize,
  IconMinimize,
  IconSplit,
  IconError,
  IconWarning,
  IconSuccess,
  IconInfo,
  IconLoading,
  IconSpinner,
  IconCircle,
  IconTarget,
  IconBug,
  IconX,
  IconSun,
  IconMoon,
  IconKeyboard,
  IconHelp,
  IconExternalLink,
  IconClock,
  IconStar,
  IconHeart,
  IconHome,
  IconArrowLeft,
  IconArrowRight,
  IconUndo,
  IconRedo,
  IconLayout,
  IconPalette,
  IconFileJson,
  IconFileText,
  IconImage,
  getFileIcon
};


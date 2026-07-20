import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ProfileIssueReportMount from './components/ProfileIssueReportMount'
import { installShowCommunityPortal } from './components/ShowCommunityPortal'
import { supabase } from './lib/supabase'
import { installNativeApiBridge } from './lib/installNativeApiBridge'
import { installMobileOverscrollGuard } from './lib/installMobileOverscrollGuard'
import { installUserCacheIsolation } from
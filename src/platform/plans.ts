import type { PlanId } from './types';
export interface PlanDefinition { id: PlanId; name: string; monthlyNgn: number; seats: number; clientWorkspaces: number; description: string }
export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: { id: 'starter', name: 'Starter', monthlyNgn: 19500, seats: 10, clientWorkspaces: 0, description: 'Core service desk, assets and knowledge for one organisation.' },
  professional: { id: 'professional', name: 'Professional', monthlyNgn: 59500, seats: 40, clientWorkspaces: 0, description: 'Maintenance, projects, procurement, finance and compliance.' },
  business: { id: 'business', name: 'Business', monthlyNgn: 149500, seats: 150, clientWorkspaces: 0, description: 'Multi-branch operations, advanced reporting and priority support.' },
  enterprise: { id: 'enterprise', name: 'Enterprise', monthlyNgn: 0, seats: Infinity, clientWorkspaces: 0, description: 'Commercial agreement required; contact TechPros.' },
  msp_launch: { id: 'msp_launch', name: 'MSP Launch', monthlyNgn: 49500, seats: 15, clientWorkspaces: 5, description: 'Provider console for up to five client workspaces.' },
  msp_growth: { id: 'msp_growth', name: 'MSP Growth', monthlyNgn: 129500, seats: 50, clientWorkspaces: 20, description: 'Delegated delivery, agreements and client reporting.' },
  msp_scale: { id: 'msp_scale', name: 'MSP Scale', monthlyNgn: 299500, seats: 150, clientWorkspaces: 100, description: 'Scaled service delivery and commercial controls.' },
};
export const SELF_SERVE_PLANS: PlanId[] = ['starter', 'professional', 'business', 'msp_launch', 'msp_growth', 'msp_scale'];

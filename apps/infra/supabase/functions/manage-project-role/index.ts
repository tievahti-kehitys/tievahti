import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the calling user is authenticated and is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const body = await req.json();
    const { action, projectId, email, userId, role } = body;

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'projectId required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Check global role and project-level access in parallel
    const [globalRoleRes, canEditRes, isAdminRes] = await Promise.all([
      userClient.rpc('get_user_global_role', { _user_id: user.id }),
      userClient.rpc('can_edit_project', { _user_id: user.id, _project_id: projectId }),
      userClient.rpc('is_project_admin', { _user_id: user.id, _project_id: projectId }),
    ]);

    const globalRole = globalRoleRes.data as string | null;
    const canEditProject = canEditRes.data as boolean;
    // User can manage members if: project edit/admin OR global edit/admin
    const hasEditAccess = canEditProject || globalRole === 'edit' || globalRole === 'admin';
    // User can grant admin role if: project admin OR global admin
    const isAdmin = (isAdminRes.data as boolean) || globalRole === 'admin';

    if (!hasEditAccess) {
      return new Response(JSON.stringify({ error: 'Ei oikeuksia hallita jäseniä tässä projektissa' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // Use service role for admin operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);


    if (action === 'add') {
      if (!email || !role) {
        return new Response(JSON.stringify({ error: 'email and role required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // Only admins can grant admin role
      if (role === 'admin' && !isAdmin) {
        return new Response(JSON.stringify({ error: 'Vain admin voi antaa admin-oikeuksia' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }

      // Find user by email
      const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) {
        return new Response(JSON.stringify({ error: 'Käyttäjien haku epäonnistui' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const targetUser = usersData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (!targetUser) {
        return new Response(JSON.stringify({ error: `Käyttäjää ei löydy sähköpostilla: ${email}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      const { error: insertError } = await adminClient
        .from('project_roles')
        .upsert({
          project_id: projectId,
          user_id: targetUser.id,
          role,
          invited_by: user.id,
        }, { onConflict: 'project_id,user_id' });

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // Return user email for display
      return new Response(JSON.stringify({ ok: true, userId: targetUser.id, email: targetUser.email }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (action === 'remove') {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'userId required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // Only project owner (projects.user_id) can remove members
      const { data: projectData, error: projectError } = await adminClient
        .from('projects')
        .select('user_id')
        .eq('id', projectId)
        .single();

      if (projectError || !projectData) {
        return new Response(JSON.stringify({ error: 'Projekttia ei löydy' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      // Also allow global admin to remove
      if (projectData.user_id !== user.id && globalRole !== 'admin') {
        return new Response(JSON.stringify({ error: 'Vain projektin omistaja voi poistaa jäseniä' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }

      const { error: deleteError } = await adminClient
        .from('project_roles')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId);

      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (action === 'list_with_emails') {
      // Fetch project_roles and enrich with emails
      const { data: roles, error: rolesError } = await adminClient
        .from('project_roles')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at');

      if (rolesError) {
        return new Response(JSON.stringify({ error: rolesError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const { data: usersData } = await adminClient.auth.admin.listUsers();
      const userMap = new Map(usersData?.users.map(u => [u.id, u.email]) || []);

      const enriched = (roles || []).map((r: any) => ({
        ...r,
        email: userMap.get(r.user_id) || r.user_id,
      }));

      return new Response(JSON.stringify({ ok: true, members: enriched }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (action === 'update_role') {
      if (!userId || !role) {
        return new Response(JSON.stringify({ error: 'userId and role required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // Only admins can grant admin role
      if (role === 'admin' && !isAdmin) {
        return new Response(JSON.stringify({ error: 'Vain admin voi antaa admin-oikeuksia' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }

      const { error: updateError } = await adminClient
        .from('project_roles')
        .update({ role })
        .eq('project_id', projectId)
        .eq('user_id', userId);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

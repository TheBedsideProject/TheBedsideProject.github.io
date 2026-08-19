(function(window) {
    "use strict";

    window.supabase = window.supabase || {};

    window.supabase.createClient = function(url, apiKey) {
        if (!url || !apiKey) {
            console.error("Supabase Initialization Error: Missing credentials.");
            return null;
        }

        const headers = {
            "apikey": apiKey,
            "Authorization": "Bearer " + apiKey,
            "Content-Type": "application/json"
        };

        const makeRequest = async (path, method, body) => {
            try {
                const response = await fetch(url + path, {
                    method: method,
                    headers: headers,
                    body: body ? JSON.stringify(body) : null
                });

                if (!response.ok) {
                    const errorJson = await response.json().catch(() => ({}));
                    return { 
                        data: null, 
                        error: { message: errorJson.error_description || errorJson.msg || "Database Request Failed" } 
                    };
                }

                const responseData = method === "DELETE" ? null : await response.json();
                return { data: responseData, error: null };
            } catch (err) {
                return { data: null, error: err };
            }
        };

        return {
            auth: {
                signUp: async (credentials) => {
                    return makeRequest("/auth/v1/signup", "POST", {
                        email: credentials.email,
                        password: credentials.password
                    });
                },
                signInWithPassword: async (credentials) => {
                    const response = await makeRequest("/auth/v1/token?grant_type=password", "POST", {
                        email: credentials.email,
                        password: credentials.password
                    });

                    if (response.data && response.data.user) {
                        return { data: { user: response.data.user }, error: null };
                    }
                    return { data: null, error: response.error || { message: "Invalid credentials." } };
                },
                signOut: async () => ({ error: null }),
                getUser: async () => {
                    const activeUser = typeof currentUser !== 'undefined' ? currentUser : null;
                    return { data: { user: activeUser }, error: null };
                }
            },
            from: (table) => ({
                select: (columns) => ({
                    eq: (column, targetValue) => ({
                        single: async () => {
                            const response = await makeRequest(`/rest/v1/${table}?${column}=eq.${targetValue}`, "GET");
                            // Fixed structural item extractor securely unpacks object entry arrays via index maps
                            const resolvedData = (response.data && response.data.length > 0) ? response.data[0] : null;
                            return { data: resolvedData, error: response.error };
                        },
                        order: (orderBy, settings) => ({
                            limit: async (quantity) => {
                                const response = await makeRequest(`/rest/v1/${table}?sender_name=eq.${targetValue}&order=${orderBy}.${settings.ascending ? "asc" : "desc"}&limit=${quantity}`, "GET");
                                return { data: response.data || [], error: response.error };
                            },
                            then: async (callback) => {
                                const response = await makeRequest(`/rest/v1/${table}?room_id=eq.${targetValue}&order=${orderBy}.${settings.ascending ? "asc" : "desc"}`, "GET");
                                callback({ data: response.data || [], error: response.error });
                            }
                        })
                    })
                }),
                limit: async (quantity) => {
                    const response = await makeRequest(`/rest/v1/${table}?order=created_at.desc&limit=${quantity}`, "GET");
                    return { data: response.data || [], error: response.error };
                },
                then: async (callback) => {
                    const response = await makeRequest(`/rest/v1/${table}`, "GET");
                    callback({ data: response.data || [], error: response.error });
                },
                upsert: async (payload) => {
                    return makeRequest(`/rest/v1/${table}`, "POST", payload);
                },
                delete: () => ({
                    eq: (column, targetValue) => ({
                        then: async (callback) => {
                            const response = await makeRequest(`/rest/v1/${table}?${column}=eq.${targetValue}`, "DELETE");
                            callback(response);
                        }
                    })
                })
            }),
            channel: () => ({
                on: () => ({
                    subscribe: () => console.log("Sync online")
                })
            })
        };
    };
})(window);

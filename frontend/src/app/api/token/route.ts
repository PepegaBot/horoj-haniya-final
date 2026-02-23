import { NextResponse } from 'next/server';

const CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Missing Discord application credentials. Please check your .env.local file.");
}

export async function POST(req: Request) {
  const { code } = await req.json();

  if (!code) {
    return NextResponse.json({ error: 'Code is missing' }, { status: 400 });
  }

  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('grant_type', 'authorization_code');
  params.append('code', code);

  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("Failed to fetch Discord token:", data);
        return NextResponse.json({ error: 'Failed to fetch Discord token', details: data }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Internal server error in /api/token:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

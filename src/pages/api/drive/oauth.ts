import type { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import { serialize } from 'cookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Ensure env variables exist
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL}/api/drive/oauth`;

  if (!CLIENT_ID || !CLIENT_SECRET || !process.env.NEXT_PUBLIC_BASE_URL) {
    return res.status(500).json({ error: 'Missing Google OAuth environment variables' });
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  try {
    // Step 2: Handle redirect from Google with code
    if (req.method === 'GET' && req.query.code) {
      const { tokens } = await oauth2Client.getToken(req.query.code as string);
      oauth2Client.setCredentials(tokens);

      if (!tokens.access_token) {
        return res.status(400).json({ error: 'Access token missing from token response' });
      }

      // Set access token cookie
      res.setHeader('Set-Cookie', serialize('gdrive_token', tokens.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 3600,
        sameSite: 'lax',
      }));

      return res.redirect('/dashboard?gdrive=success');
    }

    // Step 1: Redirect user to Google's OAuth consent screen
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.file'],
    });

    return res.redirect(authUrl);
  } catch (err: any) {
    console.error('OAuth error:', err.message);
    return res.status(500).json({ error: 'OAuth handler failed', details: err.message });
  }
}

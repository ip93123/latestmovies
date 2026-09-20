export default async function handler(req, res) {
  const { id, type, season, episode } = req.query;

  if (!id || !type) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  // Helper to fetch IMDb ID securely
  async function getImdbId(tmdbId, mediaType) {
    try {
      const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids`;
      const fetchRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${process.env.TMDB_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      if (!fetchRes.ok) return null;
      const data = await fetchRes.json();
      return data.imdb_id || null;
    } catch {
      return null;
    }
  }

  const imdbId = await getImdbId(id, type);

  let urls = [];
  let labels = [];

  if (type === 'tv') {
    const s = season || 1;
    const e = episode || 1;
    
    urls = [
      `https://vidlove.cc/embed/tv/${id}/${s}/${e}?primarycolor=E8C97A&secondarycolor=07090F&iconcolor=E8C97A&autoplay=1&showNextEpisode=1`,
      `https://vidlink.pro/tv/${id}/${s}/${e}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true&nextEpisode=true&episodeSelector=true`,
      `https://vidnest.fun/tv/${id}/${s}/${e}`,
      `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}&autoplay=1`,
      `https://peachify.top/embed/tv/${id}/${s}/${e}?autoNext=5`,
    ];
    labels = ['Infinity', 'VidLink', 'VidNest', 'Aether', 'Nexus'];

    urls.push(
      `https://player.videasy.net/tv/${id}/${s}/${e}?autoplay=1`,
      `https://embedmaster.link/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vidcore.net/tv/${id}/${s}/${e}?autoplay=1&server=orbit`
    );
    labels.push('Phantom', 'Spectra', 'Orbit');

    if (imdbId) {
      urls.push(`https://primesrc.me/embed/tv?imdb=${imdbId}&season=${s}&episode=${e}`);
      labels.push('Pulse');
    }

    urls.push(
      `https://vixsrc.to/tv/${id}/${s}/${e}`,
      `https://cinesrc.st/embed/tv/${id}?s=${s}&e=${e}`,
      `https://anyembed.xyz/embed/tmdb-tv-${id}-${s}-${e}?logo=false`,
      `https://vidfast.pro/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vidup.to/tv/${id}/${s}/${e}`,
      `https://vidy.st/tv/${id}/${s}/${e}?color=E8C97A&autoplay=true&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true`
    );
    labels.push('Hyperion', 'Flux', 'Stellar', 'OmniPlay', 'Vidup', 'Vidy');

  } else {
    // Movie
    urls = [
      `https://vidlove.cc/embed/movie/${id}?primarycolor=E8C97A&secondarycolor=07090F&iconcolor=E8C97A&autoplay=1`,
      `https://vidlink.pro/movie/${id}?primaryColor=E8C97A&secondaryColor=07090F&iconColor=E8C97A&autoplay=true`,
      `https://vidnest.fun/movie/${id}`,
      `https://vidsrc.me/embed/movie?tmdb=${id}&autoplay=1`,
      `https://peachify.top/embed/movie/${id}`,
    ];
    labels = ['Infinity', 'VidLink', 'VidNest', 'Aether', 'Nexus'];

    urls.push(
      `https://player.videasy.net/movie/${id}?autoplay=1`,
      `https://embedmaster.link/movie/${id}?autoplay=1`,
      `https://vidcore.net/movie/${id}?autoplay=1&server=orbit`
    );
    labels.push('Phantom', 'Spectra', 'Orbit');

    if (imdbId) {
      urls.push(`https://primesrc.me/embed/movie?imdb=${imdbId}`);
      labels.push('Pulse');
    }

    urls.push(
      `https://vixsrc.to/movie/${id}`,
      `https://cinesrc.st/embed/movie/${id}`,
      `https://anyembed.xyz/embed/tmdb-movie-${id}?logo=false`,
      `https://vidfast.pro/movie/${id}?autoplay=1`,
      `https://vidup.to/movie/${id}`,
      `https://vidy.st/movie/${id}?color=E8C97A&autoplay=true`
    );
    labels.push('Hyperion', 'Flux', 'Stellar', 'OmniPlay', 'Vidup', 'Vidy');
  }

  // Short cache so new servers appear quickly
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');
  res.status(200).json({ urls, labels });
}

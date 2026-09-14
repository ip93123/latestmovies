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
      `https://peachify.top/embed/tv/${id}/${s}/${e}?autoNext=5`,
      `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}&autoplay=1`,
      `https://player.videasy.net/tv/${id}/${s}/${e}?autoplay=1`,
      `https://embedmaster.link/tv/${id}/${s}/${e}?autoplay=1`,
      `https://vidcore.net/tv/${id}/${s}/${e}?autoplay=1&server=orbit`,
    ];
    labels = ['Server 1', 'Server 2', 'Server 3', 'Server 4', 'Server 5'];
    
    if (imdbId) {
      urls.push(`https://primesrc.me/embed/tv?imdb=${imdbId}&season=${s}&episode=${e}`);
      labels.push('Server 6');
    }
    
    urls.push(
      `https://vixsrc.to/tv/${id}/${s}/${e}`,
      `https://cinesrc.st/embed/tv/${id}?s=${s}&e=${e}`,
      `https://anyembed.xyz/embed/tmdb-tv-${id}-${s}-${e}?logo=false`,
      `https://vidfast.pro/tv/${id}/${s}/${e}?autoplay=1`
    );
    labels.push('Server 7', 'Server 8', 'Server 9', 'Server 10');

  } else {
    // Movie
    urls = [
      `https://peachify.top/embed/movie/${id}`,
      `https://vidsrc.me/embed/movie?tmdb=${id}&autoplay=1`,
      `https://player.videasy.net/movie/${id}?autoplay=1`,
      `https://embedmaster.link/movie/${id}?autoplay=1`,
      `https://vidcore.net/movie/${id}?autoplay=1&server=orbit`,
    ];
    labels = ['Server 1', 'Server 2', 'Server 3', 'Server 4', 'Server 5'];

    if (imdbId) {
      urls.push(`https://primesrc.me/embed/movie?imdb=${imdbId}`);
      labels.push('Server 6');
    }

    urls.push(
      `https://vixsrc.to/movie/${id}`,
      `https://cinesrc.st/embed/movie/${id}`,
      `https://anyembed.xyz/embed/tmdb-movie-${id}?logo=false`,
      `https://vidfast.pro/movie/${id}?autoplay=1`
    );
    labels.push('Server 7', 'Server 8', 'Server 9', 'Server 10');
  }

  // Add cache headers for edge caching
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
  res.status(200).json({ urls, labels });
}

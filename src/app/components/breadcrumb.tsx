
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  path?: string;
}

export default function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const navigate = useNavigate();

  return (
    <Box className="flex items-center gap-2 text-sm text-gray-400 py-4 border-b border-gray-900">
      {items.map((item, index) => (
        <Box key={index} className="flex items-center gap-2">
          {item.path ? (
            <button
              onClick={() => navigate(item.path!)}
              className="hover:text-white transition-colors"
            >
              {item.label}
            </button>
          ) : (
            <span className={index === items.length - 1 ? 'text-white' : ''}>
              {item.label}
            </span>
          )}
          {index < items.length - 1 && (
            <span className="text-gray-600">/</span>
          )}
        </Box>
      ))}
    </Box>
  );
}


defmodule LiveBetting.Matches do
  @moduledoc """
  The Matches context.
  """

  import Ecto.Query, warn: false
  alias LiveBetting.Repo

  alias LiveBetting.Matches.Match

  @doc """
  Returns the list of matches.

  ## Examples

      iex> list_matches()
      [%Match{}, ...]

  """
  def list_matches do
    Repo.all(Match)
  end

  @doc """
  Gets a single match.

  Raises `Ecto.NoResultsError` if the Match does not exist.

  ## Examples

      iex> get_match!(123)
      %Match{}

      iex> get_match!(456)
      ** (Ecto.NoResultsError)

  """
  def get_match!(id), do: Repo.get!(Match, id)

  @doc """
  Creates a match.

  ## Examples

      iex> create_match(%{field: value})
      {:ok, %Match{}}

      iex> create_match(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_match(attrs) do
    %Match{}
    |> Match.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a match.

  ## Examples

      iex> update_match(match, %{field: new_value})
      {:ok, %Match{}}

      iex> update_match(match, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_match(%Match{} = match, attrs) do
    match
    |> Match.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a match.

  ## Examples

      iex> delete_match(match)
      {:ok, %Match{}}

      iex> delete_match(match)
      {:error, %Ecto.Changeset{}}

  """
  def delete_match(%Match{} = match) do
    Repo.delete(match)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking match changes.

  ## Examples

      iex> change_match(match)
      %Ecto.Changeset{data: %Match{}}

  """
  def change_match(%Match{} = match, attrs \\ %{}) do
    Match.changeset(match, attrs)
  end

  alias LiveBetting.Matches.Pool

  @doc """
  Returns the list of pools.

  ## Examples

      iex> list_pools()
      [%Pool{}, ...]

  """
  def list_pools do
    Repo.all(Pool)
  end

  @doc """
  Gets a single pool.

  Raises `Ecto.NoResultsError` if the Pool does not exist.

  ## Examples

      iex> get_pool!(123)
      %Pool{}

      iex> get_pool!(456)
      ** (Ecto.NoResultsError)

  """
  def get_pool!(id), do: Repo.get!(Pool, id)

  @doc """
  Creates a pool.

  ## Examples

      iex> create_pool(%{field: value})
      {:ok, %Pool{}}

      iex> create_pool(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_pool(attrs) do
    %Pool{}
    |> Pool.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a pool.

  ## Examples

      iex> update_pool(pool, %{field: new_value})
      {:ok, %Pool{}}

      iex> update_pool(pool, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_pool(%Pool{} = pool, attrs) do
    pool
    |> Pool.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a pool.

  ## Examples

      iex> delete_pool(pool)
      {:ok, %Pool{}}

      iex> delete_pool(pool)
      {:error, %Ecto.Changeset{}}

  """
  def delete_pool(%Pool{} = pool) do
    Repo.delete(pool)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking pool changes.

  ## Examples

      iex> change_pool(pool)
      %Ecto.Changeset{data: %Pool{}}

  """
  def change_pool(%Pool{} = pool, attrs \\ %{}) do
    Pool.changeset(pool, attrs)
  end

  alias LiveBetting.Matches.Window

  @doc """
  Returns the list of windows.

  ## Examples

      iex> list_windows()
      [%Window{}, ...]

  """
  def list_windows do
    Repo.all(Window)
  end

  @doc """
  Gets a single window.

  Raises `Ecto.NoResultsError` if the Window does not exist.

  ## Examples

      iex> get_window!(123)
      %Window{}

      iex> get_window!(456)
      ** (Ecto.NoResultsError)

  """
  def get_window!(id), do: Repo.get!(Window, id)

  @doc """
  Creates a window.

  ## Examples

      iex> create_window(%{field: value})
      {:ok, %Window{}}

      iex> create_window(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_window(attrs) do
    %Window{}
    |> Window.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a window.

  ## Examples

      iex> update_window(window, %{field: new_value})
      {:ok, %Window{}}

      iex> update_window(window, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_window(%Window{} = window, attrs) do
    window
    |> Window.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a window.

  ## Examples

      iex> delete_window(window)
      {:ok, %Window{}}

      iex> delete_window(window)
      {:error, %Ecto.Changeset{}}

  """
  def delete_window(%Window{} = window) do
    Repo.delete(window)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking window changes.

  ## Examples

      iex> change_window(window)
      %Ecto.Changeset{data: %Window{}}

  """
  def change_window(%Window{} = window, attrs \\ %{}) do
    Window.changeset(window, attrs)
  end
end
